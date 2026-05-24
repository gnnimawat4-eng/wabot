const { Worker } = require('bullmq');
const { redis } = require('../services/redis');
const { supabase } = require('../services/supabase');
const wa = require('../services/whatsapp');

function createFlowWorker() {
  return new Worker('flow-steps', async (job) => {
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

    await executeStep(step, contact, workspace, run);

    // Advance to next step
    const { data: nextStep } = await supabase
      .from('flow_steps')
      .select('*')
      .eq('flow_id', run.flow_id)
      .eq('position', step.position + 1)
      .single();

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

  switch (step.type) {
    case 'send_message':
      if (workspace.wa_phone_number_id && workspace.wa_access_token) {
        await wa.sendText(workspace.wa_phone_number_id, workspace.wa_access_token, contact.phone, cfg.message || '');
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

    case 'send_template':
      if (workspace.wa_phone_number_id && workspace.wa_access_token) {
        await wa.sendTemplate(
          workspace.wa_phone_number_id,
          workspace.wa_access_token,
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

    case 'condition':
      // basic tag/stage condition — could branch in future
      break;
  }
}

module.exports = { createFlowWorker };
