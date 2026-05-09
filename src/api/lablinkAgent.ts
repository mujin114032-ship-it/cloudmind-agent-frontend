import request, { getLablinkToken } from '@/utils/request'
import { fetchEventSource } from '@microsoft/fetch-event-source'

export interface LablinkAgentBootstrapData {
  initialized: boolean
  hasPrivateKnowledgeBase: boolean
  hasLlmKey: boolean
  knowledgeBaseId?: string | null
  knowledgeBaseName?: string | null
  apiKeyMask?: string | null
  modelName?: string | null
  defaultPromptVersion?: string | null
  defaultSearchMode?: 'fast' | 'balanced' | 'quality' | string | null
  historySyncStatus?: string | null
}


export interface LablinkAgentSessionVO {
  sessionId: string
  knowledgeBaseId: string
  title: string
  status: number
  messageCount: number
  lastMessage?: string | null
  lastMessageTime?: string | null
  createTime: string
}

export interface LablinkAgentMessageVO {
  messageId: string
  sessionId: string
  role: 'user' | 'assistant'
  content: string
  status: number
  traceId?: string | null
  retrievalCostMs?: number | null
  llmCostMs?: number | null
  totalCostMs?: number | null
  references?: any[]
  createTime: string
}

export interface SaveLlmKeyRequest {
  apiKey: string
  modelName: string
}

export interface LablinkAgentChatRequest {
  sessionId?: string | null
  question: string
  searchMode?: 'fast' | 'balanced' | 'quality'
  topK?: number
  scoreThreshold?: number
  promptVersion?: string
}

export function getLablinkAgentBootstrap() {
  return request.get<any, LablinkAgentBootstrapData>('/api/lablink/agent/bootstrap')
}

export function saveLablinkAgentLlmKey(data: SaveLlmKeyRequest) {
  return request.post<any, LablinkAgentBootstrapData>('/api/lablink/agent/llm-key', data)
}

export function getLablinkAgentSessions() {
  return request.get<any, LablinkAgentSessionVO[]>('/api/lablink/agent/sessions')
}

export function getLablinkAgentSessionMessages(sessionId: string) {
  return request.get<any, LablinkAgentMessageVO[]>(`/api/lablink/agent/sessions/${sessionId}/messages`)
}

export function lablinkAgentStreamChat(
  data: LablinkAgentChatRequest,
  handlers: {
    onMessageCreated?: (data: any) => void
    onRetrievalStart?: (data: any) => void
    onRetrievalDone?: (data: any) => void
    onDelta?: (data: any) => void
    onDone?: (data: any) => void
    onError?: (message: string) => void
  },
  signal?: AbortSignal
) {
  const token = getLablinkToken()

  return fetchEventSource('/api/lablink/agent/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
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
      let payload: any = {}
      try {
        payload = event.data ? JSON.parse(event.data) : {}
      } catch (error) {
        payload = { content: event.data }
      }

      switch (event.event) {
        case 'message_created':
          handlers.onMessageCreated?.(payload)
          break
        case 'retrieval_start':
          handlers.onRetrievalStart?.(payload)
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
      handlers.onError?.(err instanceof Error ? err.message : String(err))
      throw err
    }
  })
}
