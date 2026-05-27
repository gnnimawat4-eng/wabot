const { supabase } = require('./supabase');
const wa = require('./whatsapp');

// ── Trigger evaluation ────────────────────────────────────────────────────────

// Returns { matched: boolean, flowName: string|null, matchedFlow: object|null }
async function evaluateTriggers(workspaceId, contact, event) {
  const { data: flows } = await supabase
    .from('flows')
    .select('*, flow_steps(*)')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true);

  if (!flows) return { matched: false, flowName: null, matchedFlow: null };

  let anyMatched = false;
  let matchedFlow = null;

  for (const flow of flows) {
    const trigger = { type: flow.trigger_type, ...(flow.trigger_config || {}) };
    let matched = false;

    if (trigger.type === 'keyword' && event.type === 'message') {
      const raw = trigger.keyword || '';
      const keywords = raw.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean);
      const body = event.body?.toLowerCase() || '';
      matched = keywords.some((kw) => body.includes(kw));
    } else if (trigger.type === 'new_contact' && event.type === 'new_contact') {
      matched = true;
    } else if (trigger.type === 'stage_change' && event.type === 'stage_change') {
      matched = trigger.stage === event.stage;
    }

    if (matched) {
      matchedFlow = flow;
      await startFlow(flow, contact);
      anyMatched = true;
    }
  }

  return { matched: anyMatched, flowName: matchedFlow?.name ?? null, matchedFlow };
}

// ── Flow start ────────────────────────────────────────────────────────────────

async function startFlow(flow, contact) {
  const steps = (flow.flow_steps || []).sort((a, b) => a.position - b.position);
  console.log(`=== START FLOW: "${flow.name}" — ${steps.length} step(s) ===`);

  if (!steps.length) {
    console.log('=== FLOW HAS NO STEPS — nothing to execute ===');
    return;
  }
  console.log('First step:', JSON.stringify({ id: steps[0].id, type: steps[0].type, config: steps[0].config }));

  const { data: run, error: runError } = await supabase
    .from('flow_runs')
    .insert({
      flow_id: flow.id,
      contact_id: contact.id,
      workspace_id: flow.workspace_id,
      status: 'running',
      current_step: 0,
      meta: {},
    })
    .select()
    .single();

  console.log('flow_run created:', run?.id, '| error:', runError?.message ?? 'none');
  if (!run) return;

  // Fetch the workspace once, then run all steps in-process (fire-and-forget
  // so the webhook handler can return 200 immediately).
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', flow.workspace_id)
    .single();

  if (!workspace) {
    console.log('=== WORKSPACE NOT FOUND for flow execution ===');
    return;
  }

  console.log('=== EXECUTING STEPS IN-PROCESS (no queue needed) ===');
  executeStepsDirect(run, steps, contact, workspace).catch((err) =>
    console.error('Flow execution error:', err?.message)
  );
}

// ── Direct step execution (replaces BullMQ worker) ───────────────────────────

async function executeStepsDirect(run, steps, contact, workspace) {
  for (const step of steps) {
    // Re-check run status before each step (on_reply may have paused it)
    const { data: currentRun } = await supabase
      .from('flow_runs')
      .select('status')
      .eq('id', run.id)
      .single();

    if (!currentRun || currentRun.status === 'completed' || currentRun.status === 'waiting_reply') break;

    const result = await executeStep(step, contact, workspace, run);
    if (result?.pause) break;

    // Honour wait steps inline (cap at 60 s so Railway doesn't kill the process)
    if (step.type === 'wait') {
      const delayMs = Math.min(step.config?.delay_ms || 0, 60_000);
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  // Mark completed if still running after all steps
  const { data: finalRun } = await supabase
    .from('flow_runs')
    .select('status')
    .eq('id', run.id)
    .single();

  if (finalRun?.status === 'running') {
    await supabase.from('flow_runs').update({ status: 'completed' }).eq('id', run.id);
  }
}

async function executeStep(step, contact, workspace, run) {
  // Prefer new `config` column; fall back to old `message_body` for legacy rows
  const cfg = (step.config && Object.keys(step.config).length)
    ? step.config
    : (step.message_body || {});

  const phoneNumberId = workspace.phone_number_id;
  const accessToken = workspace.access_token;

  console.log('=== EXECUTE STEP ===', JSON.stringify({
    type: step.type, cfg, hasPhone: !!phoneNumberId, hasToken: !!accessToken,
  }));

  switch (step.type) {
    case 'send_message': {
      const messageText = cfg.message || cfg.text || '';
      console.log('=== SENDING MESSAGE ===', messageText, 'to:', contact.phone);
      if (phoneNumberId && accessToken) {
        await wa.sendText(phoneNumberId, accessToken, contact.phone, messageText);
        console.log('=== MESSAGE SENT ===');
        await supabase.from('messages').insert({
          workspace_id: workspace.id,
          contact_id: contact.id,
          direction: 'outbound',
          type: 'text',
          body: messageText,
          status: 'sent',
        });
      } else {
        console.log('=== SEND SKIPPED — missing phoneNumberId or accessToken ===');
      }
      break;
    }

    case 'send_buttons':
      if (phoneNumberId && accessToken && cfg.buttons?.length) {
        await wa.sendButtons(phoneNumberId, accessToken, contact.phone, cfg.body || '', cfg.buttons);
        await supabase.from('messages').insert({
          workspace_id: workspace.id,
          contact_id: contact.id,
          direction: 'outbound',
          type: 'interactive',
          body: cfg.body || '',
          status: 'sent',
        });
      }
      break;

    case 'on_reply': {
      const meta = {
        waiting_step_id: step.id,
        waiting_step_position: step.position,
        reminder_sent: false,
      };
      await supabase.from('flow_runs').update({ status: 'waiting_reply', meta }).eq('id', run.id);

      // Schedule reminder via setTimeout instead of BullMQ
      if (cfg.reminder_delay_minutes > 0 && cfg.reminder_message) {
        const delayMs = cfg.reminder_delay_minutes * 60 * 1000;
        setTimeout(
          () => sendReminder(run.id, cfg.reminder_message, contact, workspace).catch(console.error),
          delayMs
        );
      }
      return { pause: true };
    }

    case 'send_template':
      if (phoneNumberId && accessToken) {
        await wa.sendTemplate(
          phoneNumberId, accessToken, contact.phone,
          cfg.template_name, cfg.language || 'en', cfg.components || []
        );
      }
      break;

    case 'update_stage':
      await supabase.from('contacts').update({ stage: cfg.stage }).eq('id', contact.id);
      break;

    case 'wait':
      // delay handled in executeStepsDirect loop
      break;

    default:
      console.log('Unknown step type:', step.type);
  }
}

// ── Reminder (replaces BullMQ delayed job) ────────────────────────────────────

async function sendReminder(runId, message, contact, workspace) {
  const { data: run } = await supabase
    .from('flow_runs')
    .select('*')
    .eq('id', runId)
    .eq('status', 'waiting_reply')
    .maybeSingle();

  if (!run || run.meta?.reminder_sent) return;

  if (workspace?.phone_number_id && workspace?.access_token) {
    await wa.sendText(workspace.phone_number_id, workspace.access_token, contact.phone, message);
    await supabase.from('messages').insert({
      workspace_id: run.workspace_id,
      contact_id: contact.id,
      direction: 'outbound',
      type: 'text',
      body: message,
      status: 'sent',
    });
    await supabase
      .from('flow_runs')
      .update({ meta: { ...run.meta, reminder_sent: true } })
      .eq('id', runId);
  }
}

// ── Resume flow after customer reply ─────────────────────────────────────────

// Called on every inbound message. Returns true if a waiting flow consumed the reply.
async function resumeFlowOnReply(workspaceId, contact, messageBody) {
  const { data: run } = await supabase
    .from('flow_runs')
    .select('*')
    .eq('contact_id', contact.id)
    .eq('workspace_id', workspaceId)
    .eq('status', 'waiting_reply')
    .maybeSingle();

  if (!run) return false;

  const waitingStepId = run.meta?.waiting_step_id;
  const waitingStepPosition = run.meta?.waiting_step_position ?? 0;

  const { data: step } = await supabase
    .from('flow_steps')
    .select('*')
    .eq('id', waitingStepId)
    .maybeSingle();

  if (!step || step.type !== 'on_reply') return false;

  const branches = step.config?.branches || [];
  const matched = branches.find((b) =>
    messageBody.toLowerCase().includes((b.match || '').toLowerCase())
  );

  if (matched?.message) {
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('*')
      .eq('id', workspaceId)
      .single();

    if (workspace?.phone_number_id && workspace?.access_token) {
      await wa.sendText(workspace.phone_number_id, workspace.access_token, contact.phone, matched.message);
      await supabase.from('messages').insert({
        workspace_id: workspaceId,
        contact_id: contact.id,
        direction: 'outbound',
        type: 'text',
        body: matched.message,
        status: 'sent',
      });
    }
  }

  // Advance to next step
  const { data: nextStep } = await supabase
    .from('flow_steps')
    .select('*')
    .eq('flow_id', run.flow_id)
    .eq('position', waitingStepPosition + 1)
    .maybeSingle();

  if (nextStep) {
    await supabase.from('flow_runs').update({ status: 'running', meta: {} }).eq('id', run.id);
    // Execute next step directly
    const { data: workspace } = await supabase
      .from('workspaces').select('*').eq('id', workspaceId).single();
    if (workspace) {
      const { data: flow } = await supabase
        .from('flows').select('*, flow_steps(*)').eq('id', run.flow_id).single();
      if (flow) {
        const remainingSteps = (flow.flow_steps || [])
          .filter((s) => s.position >= nextStep.position)
          .sort((a, b) => a.position - b.position);
        executeStepsDirect(run, remainingSteps, contact, workspace).catch(console.error);
      }
    }
  } else {
    await supabase.from('flow_runs').update({ status: 'completed', meta: {} }).eq('id', run.id);
  }

  return true;
}

module.exports = { evaluateTriggers, startFlow, resumeFlowOnReply };
