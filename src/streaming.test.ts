import { describe, expect, it } from 'vitest'

import { Message, Model, subscriptions, update } from './main'

const ready = (): Model => ({
  prompt: 'Original prompt',
  modelStatus: { _tag: 'Ready' },
  generation: { _tag: 'Idle' },
  nextRunId: 1,
  downloads: {},
  gpu: { _tag: 'Available', adapterName: 'Test adapter', shaderF16: true },
})

describe('streaming generation', () => {
  it('accumulates chunks and preserves text on completion', () => {
    const started = update(ready(), Message.ClickedGenerate())
    const first = update(
      started.model,
      Message.ReceivedGenerationChunk({ runId: '1', text: 'Hello' }),
    )
    const second = update(
      first.model,
      Message.ReceivedGenerationChunk({ runId: '1', text: ' world' }),
    )
    expect(second.model.generation).toMatchObject({
      _tag: 'Running',
      text: 'Hello world',
    })
    const completed = update(
      second.model,
      Message.CompletedGenerateResponse({ runId: '1' }),
    )
    expect(completed.model.generation).toEqual({
      _tag: 'Complete',
      text: 'Hello world',
    })
    expect(
      update(
        completed.model,
        Message.ReceivedGenerationChunk({ runId: '1', text: ' late' }),
      ).model,
    ).toBe(completed.model)
  })

  it('keeps subscription dependencies stable across typing and chunks', () => {
    const started = update(ready(), Message.ClickedGenerate())
    const typed = update(
      started.model,
      Message.UpdatedPrompt({ value: 'Next prompt' }),
    )
    const chunked = update(
      typed.model,
      Message.ReceivedGenerationChunk({ runId: '1', text: 'Hello' }),
    )
    expect(subscriptions.generation.modelToDependencies(chunked.model)).toEqual(
      subscriptions.generation.modelToDependencies(started.model),
    )
    expect(update(chunked.model, Message.ClickedGenerate()).model).toBe(
      chunked.model,
    )
  })

  it('assigns a new run ID and ignores previous run messages', () => {
    const started = update(ready(), Message.ClickedGenerate())
    const failed = update(
      started.model,
      Message.FailedGenerateResponse({ runId: '1', errorText: 'GPU error' }),
    )
    const retried = update(failed.model, Message.ClickedGenerate())
    expect(retried.model.generation).toMatchObject({
      _tag: 'Running',
      run: { runId: '2' },
    })
    expect(
      update(retried.model, Message.CompletedGenerateResponse({ runId: '1' }))
        .model,
    ).toBe(retried.model)
  })
})
