const { supabase } = require('./supabase');
const { flowStepsQueue } = require('./redis');
const wa = require('./whatsapp');

async function evaluateTriggers(workspaceId, contact, event) {
  const { data: flows } = await supabase
    .from('flows')
    .select('*, flow_steps(*)')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true);

  if (!flows) return;

  for (const flow of flows) {
    const trigger = flow.trigger || {};
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
      await startFlow(flow, contact);
    }
  }
}

async function startFlow(flow, contact) {
  const steps = (flow.flow_steps || []).sort((a, b) => a.position - b.position);
  if (!steps.length) return;

  const { data: run } = await supabase
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

  if (!run) return;

  await enqueueStep(run.id, steps[0].id, 0);
}

async function enqueueStep(runId, stepId, delayMs = 0) {
  await flowStepsQueue.add(
    'execute-step',
    { runId, stepId },
    { delay: delayMs, attempts: 3, backoff: { type: 'exponential', delay: 5000 } }
  );
}

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

  // Advance past the on_reply step
  const { data: nextStep } = await supabase
    .from('flow_steps')
    .select('*')
    .eq('flow_id', run.flow_id)
    .eq('position', waitingStepPosition + 1)
    .maybeSingle();

  if (nextStep) {
    await supabase.from('flow_runs').update({ status: 'running', meta: {} }).eq('id', run.id);
    await enqueueStep(run.id, nextStep.id, 0);
  } else {
    await supabase.from('flow_runs').update({ status: 'completed', meta: {} }).eq('id', run.id);
  }

  return true;
}

module.exports = { evaluateTriggers, startFlow, enqueueStep, resumeFlowOnReply };
