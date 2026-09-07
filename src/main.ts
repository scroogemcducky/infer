import { Effect, Option, Schema as S, Stream } from 'effect'
import {
  Command,
  ManagedResource,
  Runtime,
  Subscription,
  type Update,
} from 'foldkit'
import { Document, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { evo } from 'foldkit/struct'

import { Button, Input } from '@foldkit/ui'

import { architectureView } from './architecture/diagram'
import {
  DownloadState,
  LoadProgress,
  recordProgress,
  totalProgress,
} from './architecture/progress'
import { runtimeDetailsView } from './architecture/runtime-details'
import { GpuStatus, checkGpu } from './inference/capabilities'
import type { LlmEngine } from './inference/engine'
import { createGemmaEngine } from './inference/transformers-js-engine'

// MODEL

const ModelStatus = defineTaggedUnion({
  Unloaded: {},
  Loading: {},
  Ready: {},
  Failed: { message: S.String },
})
const Run = S.Struct({ runId: S.String, prompt: S.String })
export const Generation = defineTaggedUnion({
  Idle: {},
  Running: { run: Run, text: S.String },
  Complete: { text: S.String },
  Failed: { text: S.String, message: S.String },
})
export const Model = S.Struct({
  prompt: S.String,
  modelStatus: ModelStatus,
  generation: Generation,
  nextRunId: S.Number,
  downloads: DownloadState,
  gpu: GpuStatus,
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  ClickedLoadModel: {},
  CompletedCheckGpu: { gpu: GpuStatus },
  UpdatedModelDownload: { progress: LoadProgress },
  AcquiredModel: {},
  ReleasedModel: {},
  FailedAcquireModel: { errorText: S.String },
  ClickedGenerate: {},
  UpdatedPrompt: { value: S.String },
  ReceivedGenerationChunk: { runId: S.String, text: S.String },
  CompletedGenerateResponse: { runId: S.String },
  FailedGenerateResponse: { runId: S.String, errorText: S.String },
})
export type Message = typeof Message.Type

// COMMAND

const CheckGpu = Command.define('CheckGpu', {
  messages: [Message.CompletedCheckGpu],
  execute: Effect.tryPromise(checkGpu).pipe(
    Effect.map(gpu => Message.CompletedCheckGpu({ gpu })),
    Effect.catch(error =>
      Effect.succeed(
        Message.CompletedCheckGpu({
          gpu: GpuStatus.Unavailable({ reason: String(error) }),
        }),
      ),
    ),
  ),
})

// UPDATE

export const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    CompletedCheckGpu: ({ gpu }) => ({ model: evo(model, { gpu: () => gpu }) }),
    ClickedLoadModel: () =>
      model.gpu._tag !== 'Available' ||
      model.modelStatus._tag === 'Loading' ||
      model.modelStatus._tag === 'Ready'
        ? { model }
        : {
            model: evo(model, {
              modelStatus: () => ModelStatus.Loading(),
              downloads: () => ({}),
            }),
          },
    UpdatedModelDownload: ({ progress }) =>
      model.modelStatus._tag === 'Loading'
        ? {
            model: evo(model, {
              downloads: downloads => recordProgress(downloads, progress),
            }),
          }
        : { model },
    AcquiredModel: () => ({
      model: evo(model, { modelStatus: () => ModelStatus.Ready() }),
    }),
    ReleasedModel: () => ({
      model: evo(model, { modelStatus: () => ModelStatus.Unloaded() }),
    }),
    FailedAcquireModel: ({ errorText }) => ({
      model: evo(model, {
        modelStatus: () => ModelStatus.Failed({ message: errorText }),
      }),
    }),
    UpdatedPrompt: ({ value }) => ({
      model: evo(model, { prompt: () => value }),
    }),
    ClickedGenerate: () => {
      if (
        model.modelStatus._tag !== 'Ready' ||
        model.generation._tag === 'Running' ||
        !model.prompt.trim()
      ) {
        return { model }
      }
      return {
        model: evo(model, {
          generation: () =>
            Generation.Running({
              run: { runId: String(model.nextRunId), prompt: model.prompt },
              text: '',
            }),
          nextRunId: value => value + 1,
        }),
      }
    },
    ReceivedGenerationChunk: ({ runId, text }) => {
      const generation = model.generation
      if (generation._tag !== 'Running' || generation.run.runId !== runId) {
        return { model }
      }
      return {
        model: evo(model, {
          generation: () =>
            evo(generation, { text: previous => previous + text }),
        }),
      }
    },
    CompletedGenerateResponse: ({ runId }) => {
      const generation = model.generation
      if (generation._tag !== 'Running' || generation.run.runId !== runId) {
        return { model }
      }
      return {
        model: evo(model, {
          generation: () => Generation.Complete({ text: generation.text }),
        }),
      }
    },
    FailedGenerateResponse: ({ runId, errorText }) => {
      const generation = model.generation
      if (generation._tag !== 'Running' || generation.run.runId !== runId) {
        return { model }
      }
      return {
        model: evo(model, {
          generation: () =>
            Generation.Failed({ text: generation.text, message: errorText }),
        }),
      }
    },
  })

// RESOURCE

export const EngineResource = ManagedResource.tag<LlmEngine>()('LlmEngine')
export const createManagedResources = (
  onProgress: (progress: LoadProgress) => void,
): ManagedResource.ManagedResources<
  Model,
  Message,
  ManagedResource.ServiceOf<typeof EngineResource>
> =>
  ManagedResource.make<Model, Message>()(entry => ({
    llm: entry(S.Option(S.Null), {
      resource: EngineResource,
      modelToMaybeRequirements: model =>
        model.modelStatus._tag === 'Loading' ||
        model.modelStatus._tag === 'Ready'
          ? Option.some(null)
          : Option.none(),
      acquire: () => Effect.tryPromise(() => createGemmaEngine(onProgress)),
      release: engine => Effect.promise(() => engine.close()),
      onAcquired: () => Message.AcquiredModel(),
      onReleased: () => Message.ReleasedModel(),
      onAcquireError: error =>
        Message.FailedAcquireModel({ errorText: String(error) }),
    }),
  }))

// SUBSCRIPTION

export const subscriptions = Subscription.make<
  Model,
  Message,
  ManagedResource.ServiceOf<typeof EngineResource>
>()(entry => ({
  generation: entry(
    { maybeRun: S.Option(Run) },
    {
      modelToDependencies: model => ({
        maybeRun:
          model.generation._tag === 'Running'
            ? Option.some(model.generation.run)
            : Option.none(),
      }),
      dependenciesToStream: ({ maybeRun }) =>
        Option.match(maybeRun, {
          onNone: () => Stream.empty,
          onSome: run =>
            Stream.unwrap(
              Effect.map(EngineResource.get, engine =>
                engine.generate(run.prompt),
              ),
            ).pipe(
              Stream.map(text =>
                Message.ReceivedGenerationChunk({ runId: run.runId, text }),
              ),
              Stream.concat(
                Stream.succeed(
                  Message.CompletedGenerateResponse({ runId: run.runId }),
                ),
              ),
              Stream.catchCause(cause =>
                Stream.succeed(
                  Message.FailedGenerateResponse({
                    runId: run.runId,
                    errorText: String(cause),
                  }),
                ),
              ),
            ),
        }),
    },
  ),
}))

// INIT

export const init: Runtime.ApplicationInit<Model, Message> = () => ({
  model: {
    prompt: 'What is reinforcement learning?',
    modelStatus: ModelStatus.Unloaded(),
    generation: Generation.Idle(),
    nextRunId: 1,
    downloads: {},
    gpu: GpuStatus.Checking(),
  },
  commands: [CheckGpu()],
})

// VIEW

export const view = (model: Model, h: HtmlBuilder<Message>): Document => {
  const ready = model.modelStatus._tag === 'Ready'
  const fraction = ready ? 1 : totalProgress(model.downloads)
  const status = ModelStatus.match(model.modelStatus, {
    Unloaded: () => '',
    Loading: () =>
      fraction >= 1 ? 'Initializing WebGPU…' : 'Loading weights…',
    Ready: () => 'Ready for inference',
    Failed: ({ message }) => `Loading failed: ${message}`,
  })
  return {
    title: 'Gemma 4 · Model atlas',
    body: h.main(
      [h.Class('app-shell')],
      [
        h.header(
          [h.Class('masthead')],
          [
            h.span([h.Class('wordmark')], ['infer']),
            h.span([h.Class('eyebrow')], ['LOCAL INTELLIGENCE / 001']),
          ],
        ),
        h.div(
          [h.Class('introduction')],
          [
            h.h2([], ['Local ', h.span([h.Class('model-variant')], ['Inference'])]),
            h.p(
              [h.Class('project-intro')],
              [
                'A small, local exploration of reinforcement learning with verifiable rewards: generate an answer, check it, and learn from the result. Inspired by ',
                h.a([h.Href('https://rlvrbook.com/')], ['the RLVR Book']),
                ' and research on ',
                h.a(
                  [h.Href('https://arxiv.org/abs/2506.14245')],
                  ['how verifiable rewards encourage correct reasoning'],
                ),
                '. ',
                "We'll download Gemma 4 E2B, a small open-source model from Google DeepMind, run it in the browser, do some evals on a task and see if we can improve those with RLVR!",
                h.br([]),
                h.br([]),
                'Your device:',
              ],
            ),
            runtimeDetailsView({ gpu: model.gpu, phase: status }, h),
            h.div(
              [h.Class('download-action')],
              [
                Button.view(
                  {
                    onClick: Message.ClickedLoadModel(),
                    isDisabled:
                      model.gpu._tag !== 'Available' ||
                      model.modelStatus._tag === 'Loading' ||
                      ready,
                    toView: attributes =>
                      h.button(
                        [...attributes.button, h.Class('button button-dark')],
                        [
                          ready
                            ? 'Gemma is loaded ✓'
                            : model.modelStatus._tag === 'Loading'
                              ? 'Loading Gemma…'
                              : model.modelStatus._tag === 'Failed'
                                ? 'Retry download ↗'
                                : 'Download Gemma ↗',
                        ],
                      ),
                  },
                  h,
                ),
              
              ],
            ),
          ],
        ),
        h.div(
          [h.Class('atlas-layout')],
          [
            h.section(
              [h.Class('model-section')],
              [
                architectureView(model.downloads, ready, h),
                h.details(
                  [h.Class('sources')],
                  [
                    h.summary([], ['Architecture notes & sources']),
                    h.p(
                      [],
                      [
                        'Simplified E2B data flow. Normalization, residual paths and PLE gates are grouped into the decoder. The output head shares token embedding weights. Optional MTP drafter is not loaded.',
                      ],
                    ),
                    h.a(
                      [h.Href('https://arxiv.org/html/2607.02770v1#S1')],
                      ['Google technical report · parameter counts ↗'],
                    ),
                    h.a(
                      [
                        h.Href(
                          'https://newsletter.maartengrootendorst.com/p/a-visual-guide-to-gemma-4',
                        ),
                      ],
                      [
                        'Maarten Grootendorst · visual architecture reference ↗',
                      ],
                    ),
                    h.a(
                      [
                        h.Href(
                          'https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX/tree/main/onnx',
                        ),
                      ],
                      ['ONNX Community · model files ↗'],
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
        h.section(
          [h.Class('playground')],
          [
            h.div(
              [h.Class('playground-heading')],
              [
                h.h2([], ['Talk to the model']),
                h.span([h.Class('eyebrow')], ['TEXT ONLY / ON DEVICE']),
              ],
            ),
            Input.view(
              {
                id: 'prompt',
                value: model.prompt,
                onInput: value => Message.UpdatedPrompt({ value }),
                toView: attributes =>
                  h.div(
                    [h.Class('prompt-field')],
                    [
                      h.label(attributes.label, ['Your prompt']),
                      h.input([...attributes.input, h.Class('prompt-input')]),
                    ],
                  ),
              },
              h,
            ),
            h.div(
              [h.Class('generation-controls')],
              [
                h.span([h.Class('muted')], ['512 token limit · thinking off']),
                Button.view(
                  {
                    onClick: Message.ClickedGenerate(),
                    isDisabled:
                      !ready ||
                      model.generation._tag === 'Running' ||
                      !model.prompt.trim(),
                    toView: attributes =>
                      h.button(
                        [...attributes.button, h.Class('button button-dark')],
                        ['Generate ↗'],
                      ),
                  },
                  h,
                ),
              ],
            ),
            h.div(
              [h.Class('response'), h.AriaLive('polite')],
              [
                Generation.match(model.generation, {
                  Idle: () => 'The response will appear here.',
                  Running: ({ text }) => text || 'Generating…',
                  Complete: ({ text }) => text,
                  Failed: ({ text, message }) =>
                    `${text}\nGeneration failed: ${message}`,
                }),
              ],
            ),
          ],
        ),
        h.footer(
          [h.Class('footer')],
          ['Foldkit + Effect / Transformers.js / Gemma 4 E2B'],
        ),
      ],
    ),
  }
}
