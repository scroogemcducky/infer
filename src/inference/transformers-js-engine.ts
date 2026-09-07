import { Effect, Queue, Stream } from 'effect'

import {
  AutoProcessor,
  Gemma4ForConditionalGeneration,
  InterruptableStoppingCriteria,
  type ProgressInfo,
  TextStreamer,
} from '@huggingface/transformers'

import { type LoadProgress, expectedModelFiles } from '../architecture/progress'
import type { LlmEngine } from './engine'
import { GEMMA_MODEL_ID, GEMMA_REVISION } from './model-catalog'

export const createLoadReporter = (
  onProgress: (progress: LoadProgress) => void,
) => {
  const reported = new Map<string, number>()
  return (info: ProgressInfo): void => {
    if (info.status !== 'progress' && info.status !== 'done') {
      return
    }
    if (!expectedModelFiles.some(file => file.file === info.file)) {
      return
    }
    const fraction =
      info.status === 'done' ? 1 : Math.min(1, Math.max(0, info.progress / 100))
    if (!Number.isFinite(fraction)) {
      return
    }
    const percent = Math.floor(fraction * 100)
    if (percent <= (reported.get(info.file) ?? -1)) {
      return
    }
    reported.set(info.file, percent)
    onProgress({ file: info.file, fraction: percent / 100 })
  }
}

export const createGemmaEngine = async (
  onProgress: (progress: LoadProgress) => void,
): Promise<LlmEngine> => {
  const modelId = GEMMA_MODEL_ID
  const processor = await AutoProcessor.from_pretrained(modelId, {
    revision: GEMMA_REVISION,
  })
  const tokenizer = processor.tokenizer
  if (!tokenizer) {
    throw new Error('Gemma processor did not provide a tokenizer')
  }
  const templateOptions = {
    enable_thinking: false,
    add_generation_prompt: true,
  }
  const model = await Gemma4ForConditionalGeneration.from_pretrained(modelId, {
    revision: GEMMA_REVISION,
    dtype: 'q4f16',
    device: 'webgpu',
    progress_callback: createLoadReporter(onProgress),
  })
  return {
    generate: prompt =>
      Stream.callback<string, Error>(queue =>
        Effect.gen(function* () {
          const stopping = new InterruptableStoppingCriteria()
          const completion = yield* Effect.sync(async () => {
            const formatted = processor.apply_chat_template(
              [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
              templateOptions,
            )
            const inputs = await processor(formatted, null, null, {
              add_special_tokens: false,
            })
            await model.generate({
              ...inputs,
              max_new_tokens: 512,
              do_sample: false,
              stopping_criteria: [stopping],
              streamer: new TextStreamer(tokenizer, {
                skip_prompt: true,
                skip_special_tokens: true,
                callback_function: text => {
                  Queue.offerUnsafe(queue, text)
                },
              }),
            })
          })
          yield* Effect.addFinalizer(() =>
            Effect.promise(async () => {
              stopping.interrupt()
              await completion.catch(() => undefined)
            }),
          )
          yield* Effect.tryPromise({
            try: () => completion,
            catch: error =>
              error instanceof Error ? error : new Error(String(error)),
          })
          yield* Queue.end(queue)
        }),
      ),
    close: async () => {
      await model.dispose()
    },
  }
}
