const { supabase } = require('./supabase');
const { flowStepsQueue } = require('./redis');

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
      const kw = (trigger.keyword || '').toLowerCase();
      matched = event.body?.toLowerCase().includes(kw);
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

module.exports = { evaluateTriggers, startFlow, enqueueStep };
