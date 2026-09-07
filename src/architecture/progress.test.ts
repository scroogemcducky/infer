import { describe, expect, it } from 'vitest'

import { createLoadReporter } from '../inference/transformers-js-engine'
import { Message, Model, update } from '../main'
import { blocks, dotCount, loadedParameters, totalParameters } from './diagram'
import {
  type LoadProgress,
  componentProgress,
  expectedModelFiles,
  recordProgress,
  totalProgress,
} from './progress'

const unloaded = (): Model => ({
  prompt: 'Hi',
  modelStatus: { _tag: 'Unloaded' },
  generation: { _tag: 'Idle' },
  nextRunId: 1,
  downloads: {},
  gpu: { _tag: 'Available', adapterName: 'Test adapter', shaderF16: true },
})

describe('architecture download progress', () => {
  it('uses a consistent parameter scale without counting the output head twice', () => {
    expect(blocks.map(block => dotCount(block.millions))).toEqual([
      400, 2340, 1870, 150, 305,
    ])
    expect(
      blocks.reduce((sum, block) => sum + dotCount(block.millions), 0),
    ).toBe(5065)
  })

  it('weights progress by file bytes and keeps missing data files unfilled', () => {
    const graphOnly = { 'onnx/embed_tokens_q4f16.onnx': 1 }
    expect(componentProgress('embed_tokens', graphOnly)).toBeLessThan(0.001)
    const half = Object.fromEntries(
      expectedModelFiles.map(file => [file.file, 0.5]),
    )
    expect(totalProgress(half)).toBe(0.5)
    expect(componentProgress('embed_tokens', half)).toBe(0.5)
    const complete = Object.fromEntries(
      expectedModelFiles.map(file => [file.file, 1]),
    )
    expect(totalProgress(complete)).toBe(1)
  })

  it('uses independent component downloads rather than overall model progress', () => {
    const downloads = Object.fromEntries(
      expectedModelFiles.map(file => [
        file.file,
        file.file.includes('embed_tokens')
          ? 0.25
          : file.file.includes('audio_encoder')
            ? 1
            : 0,
      ]),
    )
    expect(loadedParameters(downloads)).toBe(990_000_000)
    expect(totalParameters).toBe(5_065_000_000)
    expect(componentProgress('embed_tokens', downloads)).toBe(0.25)
    expect(componentProgress('audio_encoder', downloads)).toBe(1)
    expect(componentProgress('decoder_model_merged', downloads)).toBe(0)
    expect(componentProgress('vision_encoder', downloads)).toBe(0)
  })

  it('maps download and cache completion events and deduplicates sub-percent updates', () => {
    const events: Array<LoadProgress> = []
    const report = createLoadReporter(progress => events.push(progress))
    const file = 'onnx/decoder_model_merged_q4f16.onnx_data'
    report({
      status: 'progress',
      name: 'Gemma',
      file,
      loaded: 20,
      total: 100,
      progress: 20,
    })
    report({
      status: 'progress',
      name: 'Gemma',
      file,
      loaded: 20.5,
      total: 100,
      progress: 20.5,
    })
    report({ status: 'done', name: 'Gemma', file })
    report({ status: 'done', name: 'Gemma', file: 'tokenizer.json' })
    expect(events).toEqual([
      { file, fraction: 0.2 },
      { file, fraction: 1 },
    ])
    expect(recordProgress({ [file]: 0.8 }, { file, fraction: 0.2 })[file]).toBe(
      0.8,
    )
  })

  it('preserves partial progress on failure, clears it on retry, and ignores late events after ready', () => {
    const loading = update(unloaded(), Message.ClickedLoadModel())
    const progress = {
      file: 'onnx/embed_tokens_q4f16.onnx_data',
      fraction: 0.5,
    }
    const partial = update(
      loading.model,
      Message.UpdatedModelDownload({ progress }),
    )
    const failed = update(
      partial.model,
      Message.FailedAcquireModel({ errorText: 'Network error' }),
    )
    expect(failed.model.downloads[progress.file]).toBe(0.5)
    const retry = update(failed.model, Message.ClickedLoadModel())
    expect(retry.model.downloads).toEqual({})
    const ready = update(retry.model, Message.AcquiredModel())
    expect(
      update(ready.model, Message.UpdatedModelDownload({ progress })).model,
    ).toBe(ready.model)
  })
})
