import { Schema as S } from 'effect'

import modelFiles from './model-files.json'

export const LoadProgress = S.Struct({ file: S.String, fraction: S.Number })
export type LoadProgress = typeof LoadProgress.Type
export const DownloadState = S.Record(S.String, S.Number)
export type DownloadState = typeof DownloadState.Type

export type Component =
  'embed_tokens' | 'decoder_model_merged' | 'vision_encoder' | 'audio_encoder'

export const componentProgress = (
  component: Component,
  downloads: DownloadState,
): number => {
  const files = modelFiles.filter(file =>
    file.file.startsWith(`onnx/${component}_`),
  )
  const bytes = files.reduce((total, file) => total + file.bytes, 0)
  return (
    files.reduce(
      (total, file) => total + file.bytes * (downloads[file.file] ?? 0),
      0,
    ) / bytes
  )
}

export const totalProgress = (downloads: DownloadState): number =>
  modelFiles.reduce(
    (total, file) => total + file.bytes * (downloads[file.file] ?? 0),
    0,
  ) / modelFiles.reduce((total, file) => total + file.bytes, 0)

export const recordProgress = (
  downloads: DownloadState,
  progress: LoadProgress,
): DownloadState =>
  Object.fromEntries([
    ...Object.entries(downloads),
    [
      progress.file,
      Math.max(
        downloads[progress.file] ?? 0,
        Math.min(1, Math.max(0, progress.fraction)),
      ),
    ],
  ])

export const expectedModelFiles = modelFiles
