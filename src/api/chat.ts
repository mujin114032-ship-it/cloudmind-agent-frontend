// src/api/chat.ts
import request, { buildCloudMindApiUrl, getLablinkToken } from '@/utils/request'
import type { PageData } from '@/utils/request'
import { fetchEventSource } from '@microsoft/fetch-event-source'

export interface ChatSessionVO {
  sessionId: string
  knowledgeBaseId: string
  title: string
  status: number
  messageCount: number
  lastMessage?: string | null
  lastMessageTime?: string | null
  createTime: string
}

export interface ChatMessageReferenceVO {
  chunkId: string
  documentId: string
  fileName: string
  chunkIndex: number
  rankNo: number
  score?: number
  keywordScore?: number
  rerankScore?: number
  recallSource?: 'vector' | 'keyword' | 'hybrid'
  rerankRank?: number
  contextOrder?: number
  textPreview: string
  hit?: boolean
  sourceChunkId?: string
  distance?: number
}

export interface ChatMessageVO {
  messageId: string
  sessionId: string
  role: 'user' | 'assistant'
  content: string
  traceId?: string
  promptVersion?: string
  searchMode?: string
  status: number
  errorMessage?: string | null
  retrievalCostMs?: number
  llmCostMs?: number
  totalCostMs?: number
  references?: ChatMessageReferenceVO[]
  createTime: string
  // 前端辅助展示字段
  loading?: boolean 
}

export interface SessionRagQaRequest {
  question: string
  topK?: number
  scoreThreshold?: number
  promptVersion?: string
  searchMode?: 'fast' | 'balanced' | 'quality'
}

export interface SessionRagQaResponse {
  userMessage: ChatMessageVO
  assistantMessage: ChatMessageVO
}

// 1. 创建会话
export function createChatSession(data: { knowledgeBaseId: string; title: string }) {
  return request.post<any, ChatSessionVO>('/chat/sessions', data)
}

// 2. 查询会话列表
export function getChatSessionList(params: { pageNo?: number; pageSize?: number; knowledgeBaseId?: string; keyword?: string }) {
  return request.get<any, PageData<ChatSessionVO>>('/chat/sessions', { params })
}

// 3. 删除会话
export function deleteChatSession(sessionId: string) {
  return request.delete<any, null>(`/chat/sessions/${sessionId}`)
}

// 4. 查询会话历史消息
export function getChatMessageList(sessionId: string, params?: { pageNo?: number; pageSize?: number }) {
  return request.get<any, PageData<ChatMessageVO>>(`/chat/sessions/${sessionId}/messages`, { params })
}

// 5. 基于会话进行普通 RAG 问答
export function sessionRagQa(sessionId: string, data: SessionRagQaRequest) {
  return request.post<any, SessionRagQaResponse>(`/chat/sessions/${sessionId}/rag/qa`, data)
}

// 6. 基于会话进行 SSE 流式 RAG 问答
export function sessionStreamRagQa(
  sessionId: string,
  data: SessionRagQaRequest,
  handlers: {
    onMessageCreated?: (data: any) => void
    onRetrievalDone?: (data: any) => void
    onDelta?: (data: any) => void
    onDone?: (data: any) => void
    onError?: (message: string) => void
  },
  signal?: AbortSignal
) {
  const token = getLablinkToken()

  return fetchEventSource(
    buildCloudMindApiUrl(`/chat/sessions/${sessionId}/rag/qa/stream`),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(data),
      signal,
      async onopen(response) {
        if (response.ok && response.headers.get('content-type')?.includes('text/event-stream')) {
          return
        }
        throw new Error(`连接失败: ${response.status}`)
      },
      onmessage(event) {
        const payload = event.data ? JSON.parse(event.data) : {}
        switch (event.event) {
          case 'message_created':
            handlers.onMessageCreated?.(payload)
            break
          case 'retrieval_done':
            handlers.onRetrievalDone?.(payload)
            break
          case 'answer_delta':
            handlers.onDelta?.(payload)
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
        throw err // 抛出异常阻断重试逻辑
      }
    }
  )
}