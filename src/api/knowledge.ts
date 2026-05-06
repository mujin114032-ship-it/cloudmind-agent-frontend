// src/api/knowledge.ts
import request, { aiService } from '@/utils/request'
import type { PageData } from '@/utils/request'
import { fetchEventSource } from '@microsoft/fetch-event-source'

export interface KnowledgeBaseVO {
  id: string
  name: string
  description?: string
  visibility: number
  status: number
  documentCount: number
  chunkCount: number
  embeddingModel: string
  embeddingDim: number
  createTime: string
  updateTime: string
}

export interface CreateKnowledgeBaseRequest {
  name: string
  description?: string
}

export interface KnowledgeBaseQueryRequest {
  pageNo?: number
  pageSize?: number
  keyword?: string
}

// 1. 创建知识库
export function createKnowledgeBase(data: CreateKnowledgeBaseRequest) {
  return request.post<any, KnowledgeBaseVO>('/api/knowledge-bases', data)
}

// 2. 查询知识库列表
export function getKnowledgeBaseList(params: KnowledgeBaseQueryRequest) {
  return request.get<any, PageData<KnowledgeBaseVO>>('/api/knowledge-bases', { params })
}

// 3. 查询知识库详情
export function getKnowledgeBaseDetail(id: string) {
  return request.get<any, KnowledgeBaseVO>(`/api/knowledge-bases/${id}`)
}

// 4. 更新知识库
export function updateKnowledgeBase(id: string, data: CreateKnowledgeBaseRequest) {
  return request.put<any, KnowledgeBaseVO>(`/api/knowledge-bases/${id}`, data)
}

// 5. 删除知识库
export function deleteKnowledgeBase(id: string) {
  return request.delete<any, null>(`/api/knowledge-bases/${id}`)
}

export interface RetrievalTestRequest {
  query: string
  topK?: number
  scoreThreshold?: number
}

export interface RetrievedChunkVO {
  chunkId: string
  documentId: string
  fileName: string
  chunkIndex: number
  score: number
  rerankScore?: number
  textPreview: string
  hit?: boolean
  sourceChunkId?: string
  distance?: number
}

export interface RetrievalTestVO {
  knowledgeBaseId: string
  query: string
  topK: number
  resultCount: number
  costMs: number
  results: RetrievedChunkVO[]
  hitCount?: number
  contextCount?: number
}

// 测试知识库向量检索
export function retrievalTest(knowledgeBaseId: string, data: RetrievalTestRequest) {
  return request.post<any, RetrievalTestVO>(
    `/api/knowledge-bases/${knowledgeBaseId}/retrieval-test`,
    data
  )
}

export interface PromptTemplateVO {
  version: string
  name: string
}

export interface RagQaRequest {
  question: string
  topK?: number
  scoreThreshold?: number
  promptVersion?: string
}

// 获取模板的接口方法
export function getPromptTemplates() {
  return request.get<any, PromptTemplateVO[]>('/api/rag/prompt-templates')
}

export interface RagReference {
  chunkId: string
  documentId: string
  fileName: string
  chunkIndex: number
  score: number
  textPreview: string
  hit?: boolean
  sourceChunkId?: string
  distance?: number
}

export interface RagQaVO {
  traceId: string
  knowledgeBaseId: string
  question: string
  answer: string
  modelName: string
  references: RagReference[]
  retrievalCostMs: number
  llmCostMs: number
  totalCostMs: number
}

// 知识库普通 RAG 问答（使用长超时配置）
export function ragQa(knowledgeBaseId: string, data: RagQaRequest) {
  return aiService.post<any, RagQaVO>(
    `/api/knowledge-bases/${knowledgeBaseId}/rag/qa`,
    data
  )
}

// 知识库流式 RAG 问答
export function streamRagQa(
  knowledgeBaseId: string,
  data: {
    question: string
    topK?: number
    scoreThreshold?: number
  },
  handlers: {
    onRetrievalDone?: (data: any) => void
    onDelta?: (content: string) => void
    onDone?: (data: any) => void
    onError?: (message: string) => void
  },
  signal?: AbortSignal
) {
  return fetchEventSource(
    `/api/knowledge-bases/${knowledgeBaseId}/rag/qa/stream`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
        // 'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(data),
      signal,
      async onopen(response) {
        if (response.ok && response.headers.get('content-type')?.includes('text/event-stream')) {
          return // 连接成功
        }
        throw new Error(`连接失败: ${response.status}`)
      },
      onmessage(event) {
        const payload = event.data ? JSON.parse(event.data) : {}
        switch (event.event) {
          case 'retrieval_done':
            handlers.onRetrievalDone?.(payload)
            break
          case 'answer_delta':
            handlers.onDelta?.(payload.content || '')
            break
          case 'answer_done':
            handlers.onDone?.(payload)
            break
          case 'error':
            handlers.onError?.(payload.message || '流式问答失败')
            break
        }
      },
      onerror(err) {
        handlers.onError?.(String(err))
        throw err // 抛出错误以阻止 fetchEventSource 自动重试
      }
    }
  )
}

// Trace 列表与详情相关的类型定义
export interface TraceChunkVO {
  chunkId: string
  documentId: string
  fileName: string
  chunkIndex: number
  rankNo: number
  score: number
  rerankRank?: number
  rerankScore?: number
  textPreview: string
}

export interface RagTraceVO {
  traceId: string
  knowledgeBaseId: string
  requestType: number
  originalQuestion: string
  finalQuestion: string
  topK: number
  scoreThreshold: number
  resultCount: number
  promptVersion?: string
  searchMode?: string
  systemPrompt?: string
  userPrompt?: string
  modelName: string
  answer?: string
  retrievalCostMs: number
  llmCostMs: number
  totalCostMs: number
  status: number
  errorMessage?: string | null
  createTime: string
  chunks?: TraceChunkVO[]
}

// 1. 获取 Trace 列表
export function getTraceList(params: {
  pageNo?: number
  pageSize?: number
  knowledgeBaseId?: string
  status?: number
  keyword?: string
}) {
  return request.get<any, PageData<RagTraceVO>>('/api/rag/traces', { params })
}

// 2. 获取单条 Trace 详情
export function getTraceDetail(traceId: string) {
  return request.get<any, RagTraceVO>(`/api/rag/traces/${traceId}`)
}