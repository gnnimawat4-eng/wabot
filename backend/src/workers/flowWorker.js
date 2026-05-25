const { Worker } = require('bullmq');
const { redis } = require('../services/redis');
const { supabase } = require('../services/supabase');
const wa = require('../services/whatsapp');

function createFlowWorker() {
  return new Worker('flow-steps', async (job) => {
    if (job.name === 'send-reminder') {
      return handleReminder(job.data);
    }

    const { runId, stepId } = job.data;

    const { data: run } = await supabase
      .from('flow_runs')
      .select('*, flows(*)')
      .eq('id', runId)
      .single();

    if (!run || run.status !== 'running') return;

    const { data: step } = await supabase
      .from('flow_steps')
      .select('*')
      .eq('id', stepId)
      .single();

    if (!step) return;

    const { data: contact } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', run.contact_id)
      .single();

    const { data: workspace } = await supabase
      .from('workspaces')
      .select('*')
      .eq('id', run.workspace_id)
      .single();

    if (!contact || !workspace) return;

    const result = await executeStep(step, contact, workspace, run);

    // on_reply pauses the run — don't advance until user replies
    if (result?.pause) return;

    // Advance to next step
    const { data: nextStep } = await supabase
      .from('flow_steps')
      .select('*')
      .eq('flow_id', run.flow_id)
      .eq('position', step.position + 1)
      .maybeSingle();

    if (nextStep) {
      const delay = nextStep.type === 'wait' ? (nextStep.config?.delay_ms || 0) : 0;
      const { flowStepsQueue } = require('../services/redis');
      await flowStepsQueue.add('execute-step', { runId, stepId: nextStep.id }, { delay });
    } else {
      await supabase.from('flow_runs').update({ status: 'completed' }).eq('id', runId);
    }
  }, { connection: redis, concurrency: 10 });
}

async function executeStep(step, contact, workspace, run) {
  const cfg = step.config || {};
  // Use live DB column names for workspace
  const phoneNumberId = workspace.phone_number_id;
  const accessToken = workspace.access_token;

  switch (step.type) {
    case 'send_message':
      if (phoneNumberId && accessToken) {
        await wa.sendText(phoneNumberId, accessToken, contact.phone, cfg.message || '');
        await supabase.from('messages').insert({
          workspace_id: workspace.id,
          contact_id: contact.id,
          direction: 'outbound',
          type: 'text',
          body: cfg.message || '',
          status: 'sent',
        });
      }
      break;

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

      if (cfg.reminder_delay_minutes > 0 && cfg.reminder_message) {
        const { flowStepsQueue } = require('../services/redis');
        await flowStepsQueue.add(
          'send-reminder',
          { runId: run.id, message: cfg.reminder_message },
          { delay: cfg.reminder_delay_minutes * 60 * 1000, attempts: 2 }
        );
      }
      return { pause: true };
    }

    case 'send_template':
      if (phoneNumberId && accessToken) {
        await wa.sendTemplate(
          phoneNumberId,
          accessToken,
          contact.phone,
          cfg.template_name,
          cfg.language || 'en',
          cfg.components || []
        );
      }
      break;

    case 'update_stage':
      await supabase.from('contacts').update({ stage: cfg.stage }).eq('id', contact.id);
      break;

    case 'wait':
      // handled via delay in queue
      break;
  }
}

async function handleReminder({ runId, message }) {
  const { data: run } = await supabase
    .from('flow_runs')
    .select('*')
    .eq('id', runId)
    .eq('status', 'waiting_reply')
    .maybeSingle();

  // Run already resumed (customer replied) or reminder already sent — do nothing
  if (!run || run.meta?.reminder_sent) return;

  const { data: contact } = await supabase.from('contacts').select('*').eq('id', run.contact_id).single();
  const { data: workspace } = await supabase.from('workspaces').select('*').eq('id', run.workspace_id).single();

  if (!contact || !workspace?.phone_number_id || !workspace?.access_token) return;

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

module.exports = { createFlowWorker };
