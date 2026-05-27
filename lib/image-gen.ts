/**
 * 通用 gpt-image-2 生成 + Supabase Storage 上传模块
 * 支持 reference image（最多 4 张）保持视觉一致性
 */

import OpenAI from 'openai'
import { toFile } from 'openai/uploads'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export type ImageGenInput = {
  prompt: string
  size?: '1024x1024' | '1024x1792' | '1792x1024' | string // gpt-image-2 支持任意分辨率
  quality?: 'low' | 'medium' | 'high'
  referenceUrls?: string[] // 最多 4 张 reference
  bucket: string // e.g. 'character-art'
  storagePath: string // e.g. 'pets/abc123/base.png'
}

export type ImageGenResult = {
  publicUrl: string
  storagePath: string
  sizeBytes: number
  durationMs: number
}

/**
 * 生成图片并上传到 Supabase Storage
 */
export async function generateAndUpload(input: ImageGenInput): Promise<ImageGenResult> {
  const t0 = Date.now()
  const {
    prompt,
    size = '1024x1024',
    quality = 'high',
    referenceUrls = [],
    bucket,
    storagePath,
  } = input

  // 1. 如果有 reference，先 fetch 转 buffer
  const referenceFiles: File[] = []
  if (referenceUrls.length > 0) {
    if (referenceUrls.length > 4) {
      throw new Error(`最多支持 4 张 reference，当前 ${referenceUrls.length} 张`)
    }
    for (const url of referenceUrls) {
      const resp = await fetch(url)
      if (!resp.ok) throw new Error(`fetch reference ${url} 失败: ${resp.status}`)
      const buffer = Buffer.from(await resp.arrayBuffer())
      const file = await toFile(buffer, 'reference.png', { type: 'image/png' })
      referenceFiles.push(file)
    }
  }

  // 2. 调用 OpenAI (gpt-image-2 默认返回 b64_json，不需要 response_format)
  let imageB64: string
  if (referenceFiles.length === 0) {
    // 无 reference：用 generate
    const resp = await openai.images.generate({
      model: 'gpt-image-2',
      prompt,
      size: size as any,
      quality: quality as any,
      n: 1,
    })
    imageB64 = resp.data![0].b64_json!
  } else {
    // 有 reference：用 edit（gpt-image-2 的 reference 模式）
    const resp = await openai.images.edit({
      model: 'gpt-image-2',
      image: referenceFiles as any, // SDK 接受 File[]
      prompt,
      size: size as any,
      n: 1,
    })
    imageB64 = resp.data![0].b64_json!
  }

  const imageBytes = Buffer.from(imageB64, 'base64')
  const genDuration = Date.now() - t0

  // 3. 上传到 Supabase Storage
  const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const SUPA_SRV = process.env.SUPABASE_SERVICE_ROLE_KEY!

  const uploadResp = await fetch(
    `${SUPA_URL}/storage/v1/object/${encodeURI(bucket + '/' + storagePath)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPA_SRV}`,
        apikey: SUPA_SRV,
        'Content-Type': 'image/png',
        'x-upsert': 'true',
      },
      body: imageBytes,
    }
  )
  if (!uploadResp.ok) {
    const txt = await uploadResp.text()
    throw new Error(`上传 ${bucket}/${storagePath} 失败: ${uploadResp.status} ${txt}`)
  }

  const publicUrl = `${SUPA_URL}/storage/v1/object/public/${bucket}/${storagePath}`
  const totalDuration = Date.now() - t0

  return {
    publicUrl,
    storagePath,
    sizeBytes: imageBytes.length,
    durationMs: totalDuration,
  }
}
