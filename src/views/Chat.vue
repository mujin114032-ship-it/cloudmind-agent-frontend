<!-- src/views/Chat.vue -->
<template>
  <div class="chat-layout">
    <!-- 顶部导航栏 -->
    <header class="chat-header">
      <div class="header-left">
        <el-button class="gemini-back-btn" @click="$router.push('/knowledge')">
          <el-icon style="margin-right: 4px; font-size: 16px;"><ArrowLeft /></el-icon> 返回知识库
        </el-button>
        <div class="header-divider"></div>
        <span class="header-title">智能问答</span>
      </div>
      
      <div class="header-right">
        <!-- 检索参数设置 -->
        <el-popover placement="bottom-end" title="设置" :width="300" trigger="click">
          <template #reference>
            <el-button round size="small" class="settings-btn">⚙️ 设置</el-button>
          </template>
          <el-form label-width="100px" size="small" style="margin-top: 15px;">
            <!-- 流式输出开关 -->
            <el-form-item label="流式输出">
              <el-switch v-model="ragConfig.useStream" />
            </el-form-item>
            <el-form-item label="召回数量">
              <el-slider v-model="ragConfig.topK" :min="1" :max="10" />
            </el-form-item>
            <el-form-item label="最低分数">
              <el-slider v-model="ragConfig.scoreThreshold" :min="0" :max="1" :step="0.05" />
            </el-form-item>
          </el-form>
        </el-popover>
      </div>
    </header>

    <!-- 聊天内容区 -->
    <main class="chat-main" ref="messageListRef">
      <div class="message-container">
        <!-- 初始空状态 -->
        <div v-if="messages.length === 0" class="empty-state">
          <div class="gemini-sparkle-large">✨</div>
          <h2>今天想了解什么内容？</h2>
        </div>
        
        <div v-for="(msg, index) in messages" :key="index" :class="['message-row', msg.role]">
          <!-- 用户消息 -->
          <div v-if="msg.role === 'user'" class="user-bubble">
            {{ msg.content }}
          </div>
          
          <!-- AI 消息 -->
          <div v-else class="ai-wrapper">
            <div class="ai-avatar" :class="{ 'spinning': msg.loading }">✨</div>
            <div class="ai-content">
              <!-- Loading 状态（等待检索时显示） -->
              <div v-if="msg.loading && !msg.content" class="loading-pulse">
                <span class="dot"></span><span class="dot"></span><span class="dot"></span>
              </div>
              
              <!-- Markdown 正文渲染 -->
              <div 
                v-show="msg.content" 
                class="markdown-body" 
                v-html="renderMarkdown(msg.content)"
              ></div>

              <!-- 参考来源与耗时区 (流式输出完成或收到引用时展示) -->
              <div v-if="!msg.loading && msg.references !== undefined" class="reference-section">
                <el-alert 
                  v-if="msg.references && msg.references.length === 0" 
                  title="未检索到相关知识片段，回答可能未基于知识库。" 
                  type="warning" 
                  show-icon 
                  :closable="false"
                  class="no-ref-alert"
                />
                
                <el-collapse v-if="msg.references && msg.references.length > 0" class="ref-collapse">
                  <el-collapse-item>
                    <template #title>
                      <span class="ref-title-icon">📚</span> 
                      <span class="ref-title-text">{{ msg.references.length }} 个知识库参考片段</span>
                    </template>
                    <div class="ref-cards-container">
                      <div 
                        v-for="(refItem, idx) in msg.references" 
                        :key="idx" 
                        class="reference-card"
                      >
                        <div class="ref-header">
                          <span class="ref-file">{{ refItem.fileName }} (块 {{ refItem.chunkIndex }})</span>
                          <span class="ref-score">Score: {{ refItem.score.toFixed(3) }}</span>
                        </div>
                        <div class="ref-preview">{{ refItem.textPreview }}</div>
                      </div>
                    </div>
                  </el-collapse-item>
                </el-collapse>
                
                <!-- 元数据统计 (等待回答结束 answer_done 才会出现) -->
                <div class="meta-info" v-if="msg.meta">
                  <el-tooltip content="大模型调用耗时" placement="top">
                    <span class="meta-item">🤖 {{ msg.meta.modelName }} ({{ msg.meta.llmCostMs }}ms)</span>
                  </el-tooltip>
                  <el-tooltip content="向量检索耗时" placement="top">
                    <span class="meta-item">🔍 检索: {{ msg.meta.retrievalCostMs }}ms</span>
                  </el-tooltip>
                  <!-- Trace 唤起按钮 -->
                  <span 
                    v-if="msg.traceId" 
                    class="meta-item trace-btn" 
                    @click="openTraceDrawer(msg.traceId)"
                  >
                    🛠️ Trace 链路详情
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- 底部悬浮输入区 -->
    <footer class="chat-footer">
      <div class="input-wrapper">
        <el-input
          v-model="inputQuery"
          type="textarea"
          :autosize="{ minRows: 1, maxRows: 6 }"
          placeholder="向Agent提问..."
          class="gemini-input"
          @keydown.enter.prevent="handleSend"
          :disabled="isGenerating"
        />
        <div class="input-actions">
          <!-- 生成中显示停止按钮，否则显示发送按钮 -->
          <el-button 
            v-if="!isGenerating"
            type="primary" 
            circle 
            class="send-btn" 
            :disabled="!inputQuery.trim()"
            @click="handleSend"
          >
            <el-icon style="font-size: 18px;"><Right /></el-icon>
          </el-button>
          
          <el-button 
            v-else
            type="info" 
            circle 
            class="stop-btn" 
            @click="handleStop"
          >
            <div class="stop-icon"></div>
          </el-button>
        </div>
      </div>
      <div class="footer-tip">
        内容由大模型生成，可能会出现错误，请以源文档为准。
      </div>
    </footer>

    <!-- RAG Trace 抽屉 -->
    <el-drawer v-model="traceDrawerVisible" title="🛠️ RAG 执行链路分析" size="700px">
      <div class="trace-container" v-loading="traceLoading">
        <template v-if="traceData">
          <!-- 顶部状态栏 -->
          <div class="trace-header-card">
            <div class="trace-status" :class="traceData.status === 1 ? 'success' : 'error'">
              {{ traceData.status === 1 ? '✅ 生成成功' : '❌ 生成失败' }}
            </div>
            <div class="trace-id">ID: {{ traceData.traceId }}</div>
          </div>

          <el-tabs v-model="activeTraceTab" class="trace-tabs">
            <!-- Tab 1: 耗时与参数 -->
            <el-tab-pane label="⏱️ 基础分析" name="basic">
              <el-descriptions :column="1" border size="small">
                <el-descriptions-item label="原始问题">{{ traceData.originalQuestion }}</el-descriptions-item>
                <el-descriptions-item label="改写问题">{{ traceData.finalQuestion }}</el-descriptions-item>
                <el-descriptions-item label="检索耗时">
                  <span style="color: #E6A23C">{{ traceData.retrievalCostMs }} ms</span>
                </el-descriptions-item>
                <el-descriptions-item label="生成耗时">
                  <span style="color: #67C23A">{{ traceData.llmCostMs }} ms</span>
                </el-descriptions-item>
                <el-descriptions-item label="总耗时">
                  <strong>{{ traceData.totalCostMs }} ms</strong>
                </el-descriptions-item>
                <el-descriptions-item label="大模型版本">{{ traceData.modelName }}</el-descriptions-item>
                <el-descriptions-item label="Prompt版本">{{ traceData.promptVersion || '默认版本' }}</el-descriptions-item>
              </el-descriptions>
              
              <div v-if="traceData.errorMessage" class="trace-error-box">
                <strong>报错信息：</strong><br/>
                {{ traceData.errorMessage }}
              </div>
            </el-tab-pane>

            <!-- Tab 2: Prompt 还原 -->
            <el-tab-pane label="📝 Prompt 还原" name="prompt">
              <div class="prompt-section">
                <div class="prompt-title">System Prompt</div>
                <pre class="prompt-code">{{ traceData.systemPrompt || '未获取到系统提示词' }}</pre>
              </div>
              <div class="prompt-section">
                <div class="prompt-title">User Prompt (含注入片段)</div>
                <pre class="prompt-code">{{ traceData.userPrompt || '未获取到用户提示词' }}</pre>
              </div>
            </el-tab-pane>

            <!-- Tab 3: 召回排序 -->
            <el-tab-pane label="🎯 召回明细" name="chunks">
              <el-alert 
                v-if="!traceData.chunks || traceData.chunks.length === 0" 
                title="本次检索没有召回任何 Chunk" 
                type="info" 
                :closable="false"
              />
              <div class="trace-chunk-list">
                <div v-for="(chunk) in traceData.chunks" :key="chunk.chunkId" class="trace-chunk-item">
                  <div class="t-chunk-header">
                    <span class="t-chunk-rank">Rank #{{ chunk.rankNo }}</span>
                    <span class="t-chunk-score">Score: {{ chunk.score.toFixed(4) }}</span>
                  </div>
                  <div class="t-chunk-meta">
                    来源：{{ chunk.fileName }} (分块 {{ chunk.chunkIndex }}) | ID: {{ chunk.chunkId }}
                  </div>
                  <div class="t-chunk-text">{{ chunk.textPreview }}</div>
                </div>
              </div>
            </el-tab-pane>
          </el-tabs>
        </template>
        <el-empty v-else description="未能加载 Trace 数据" />
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Right } from '@element-plus/icons-vue'
import MarkdownIt from 'markdown-it'
import { streamRagQa, ragQa, getTraceDetail } from '@/api/knowledge'
import type { RagReference, RagTraceVO } from '@/api/knowledge'

const route = useRoute()
const knowledgeBaseId = route.params.knowledgeBaseId as string

const md = new MarkdownIt({ breaks: true, linkify: true })

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  loading?: boolean
  references?: RagReference[]
  traceId?: string 
  meta?: {
    modelName: string
    retrievalCostMs: number
    llmCostMs: number
  }
}

const messages = ref<ChatMessage[]>([])
const inputQuery = ref('')
const isGenerating = ref(false)
const messageListRef = ref<HTMLDivElement | null>(null)
let abortController: AbortController | null = null
const ragConfig = reactive({
  useStream: true, // 默认开启流式
  topK: 5,
  scoreThreshold: 0.3
})

// --- Trace 抽屉相关状态 ---
const traceDrawerVisible = ref(false)
const traceLoading = ref(false)
const traceData = ref<RagTraceVO | null>(null)
const activeTraceTab = ref('basic')

const renderMarkdown = (text: string) => md.render(text || '')

const scrollToBottom = () => {
  nextTick(() => {
    if (!messageListRef.value) return
    const el = messageListRef.value
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150
    if (isNearBottom || messages.value.length <= 2) {
      el.scrollTop = el.scrollHeight
    }
  })
}

const handleStop = () => {
  if (abortController) {
    abortController.abort()
    abortController = null
    isGenerating.value = false
    const lastMsg = messages.value[messages.value.length - 1]
    if (lastMsg && lastMsg.role === 'assistant') {
      lastMsg.loading = false
      if (!lastMsg.content) lastMsg.content = '*已停止生成*'
    }
  }
}

const openTraceDrawer = async (traceId: string) => {
  activeTraceTab.value = 'basic'
  traceDrawerVisible.value = true
  try {
    traceLoading.value = true
    const res = await getTraceDetail(traceId)
    traceData.value = res
  } catch (error) {
    ElMessage.error('获取 Trace 链路详情失败')
  } finally {
    traceLoading.value = false
  }
}

const handleSend = async () => {
  const question = inputQuery.value.trim()
  if (!question) return

  messages.value.push({ role: 'user', content: question })
  inputQuery.value = ''
  scrollToBottom()

  messages.value.push({ role: 'assistant', content: '', loading: true })
  scrollToBottom()

  isGenerating.value = true
  const assistantMsgIndex = messages.value.length - 1
  const currentMsg = messages.value[assistantMsgIndex]

  abortController = new AbortController()

  try {
    // 根据用户设置的开关，走不同的后端请求接口
    if (ragConfig.useStream) {
      // 走 SSE 流式接口
      await streamRagQa(
        knowledgeBaseId,
        {
          question,
          topK: ragConfig.topK,
          scoreThreshold: ragConfig.scoreThreshold
        },
        {
          onRetrievalDone: (data) => {
            currentMsg.references = data.references
            if (data.traceId) currentMsg.traceId = data.traceId
          },
          onDelta: (data: any) => {
            if (currentMsg.loading) currentMsg.loading = false
            if (data && data.traceId && !currentMsg.traceId) currentMsg.traceId = data.traceId
            currentMsg.content += (typeof data === 'string' ? data : data.content || '')
            scrollToBottom()
          },
          onDone: (data) => {
            if (data.traceId) currentMsg.traceId = data.traceId
            currentMsg.meta = {
              modelName: data.modelName,
              retrievalCostMs: data.retrievalCostMs,
              llmCostMs: data.llmCostMs
            }
            isGenerating.value = false
            abortController = null
            scrollToBottom()
          },
          onError: (errMessage) => {
            currentMsg.loading = false
            currentMsg.content += `\n\n> ⚠️ 异常中断：${errMessage}`
            isGenerating.value = false
            abortController = null
          }
        },
        abortController.signal
      )
    } else {
      // 走普通 HTTP 一次性请求接口
      const res = await ragQa(knowledgeBaseId, {
        question,
        topK: ragConfig.topK,
        scoreThreshold: ragConfig.scoreThreshold
      })
      
      currentMsg.loading = false
      currentMsg.content = res.answer
      currentMsg.references = res.references
      if (res.traceId) {
        currentMsg.traceId = res.traceId
      }
      currentMsg.meta = {
        modelName: res.modelName,
        retrievalCostMs: res.retrievalCostMs,
        llmCostMs: res.llmCostMs
      }
      isGenerating.value = false
      abortController = null
      scrollToBottom()
    }
  } catch (error: any) {
    if (error.name !== 'AbortError') {
      currentMsg.content = '网络请求发生错误，请稍后重试。'
    }
    currentMsg.loading = false
    isGenerating.value = false
    abortController = null
  }
}
</script>

<style scoped>
/* 全局布局 */
.chat-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #ffffff;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}

/* 顶部导航 */
.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(8px);
  position: sticky;
  top: 0;
  z-index: 10;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.gemini-back-btn {
  font-size: 14px;
  font-weight: 600;
  color: #1a73e8;
  background-color: #e8f0fe;
  border: none;
  border-radius: 20px;
  padding: 8px 16px;
  transition: all 0.2s ease;
}

.gemini-back-btn:hover,
.gemini-back-btn:focus {
  background-color: #d2e3fc;
  color: #174ea6;
}

.header-divider {
  width: 1px;
  height: 18px;
  background-color: #dadce0;
  margin: 0 4px;
}

.header-title {
  font-size: 16px;
  font-weight: 500;
  color: #202124;
}

.settings-btn {
  background-color: #f1f3f4;
  border: none;
  color: #5f6368;
}

/* 消息滚动区 */
.chat-main {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 20px;
  scroll-behavior: smooth;
}

.message-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 40px 20px 20px 20px;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin-top: 10vh;
  color: #202124;
}

.gemini-sparkle-large {
  font-size: 48px;
  margin-bottom: 20px;
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0% { transform: translateY(0px); }
  50% { transform: translateY(-10px); }
  100% { transform: translateY(0px); }
}

.empty-state h2 {
  font-weight: 400;
  font-size: 24px;
}

/* 消息行 */
.message-row {
  margin-bottom: 32px;
  display: flex;
  width: 100%;
}

.message-row.user {
  justify-content: flex-end;
}

.user-bubble {
  background-color: #f0f4f9;
  color: #202124;
  padding: 12px 20px;
  border-radius: 24px 24px 4px 24px;
  font-size: 15px;
  line-height: 1.6;
  max-width: 80%;
  white-space: pre-wrap;
}

.ai-wrapper {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  width: 100%;
}

.ai-avatar {
  font-size: 24px;
  line-height: 1;
  flex-shrink: 0;
  margin-top: 2px;
  transition: transform 0.5s ease;
}

.ai-avatar.spinning {
  animation: subtlePulse 1.5s infinite;
}

@keyframes subtlePulse {
  0% { transform: scale(1); opacity: 0.8; }
  50% { transform: scale(1.1); opacity: 1; }
  100% { transform: scale(1); opacity: 0.8; }
}

.ai-content {
  flex: 1;
  min-width: 0;
}

/* Markdown */
:deep(.markdown-body) {
  font-size: 15px;
  line-height: 1.7;
  color: #202124;
  background: transparent;
}
:deep(.markdown-body p) { margin-bottom: 1em; }
:deep(.markdown-body p:last-child) { margin-bottom: 0; }
:deep(.markdown-body pre) {
  background-color: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e8eaed;
}
:deep(.markdown-body blockquote) {
  border-left: 4px solid #e8eaed;
  padding-left: 16px;
  color: #5f6368;
  margin: 0;
}

/* 参考来源区 */
.reference-section {
  margin-top: 24px;
}

.no-ref-alert {
  margin-bottom: 12px;
  border-radius: 8px;
}

:deep(.ref-collapse) { border: none; }
:deep(.el-collapse-item__header) {
  background-color: transparent;
  border-bottom: none;
  height: 36px;
  line-height: 36px;
  color: #5f6368;
}
:deep(.el-collapse-item__wrap) { background-color: transparent; border-bottom: none; }

.ref-title-icon { margin-right: 8px; }
.ref-title-text { font-size: 13px; font-weight: 500; }
.ref-cards-container { display: flex; flex-direction: column; gap: 12px; padding-top: 8px; }
.reference-card {
  background-color: #f8f9fa;
  border: 1px solid #e8eaed;
  border-radius: 12px;
  padding: 12px 16px;
}
.ref-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.ref-file { font-size: 13px; font-weight: 600; color: #202124; }
.ref-score { font-size: 12px; color: #188038; background-color: #e6f4ea; padding: 2px 8px; border-radius: 10px; }
.ref-preview {
  font-size: 13px;
  color: #5f6368;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.meta-info {
  margin-top: 16px;
  display: flex;
  gap: 12px;
}
.meta-item {
  font-size: 12px;
  color: #80868b;
  background-color: #f1f3f4;
  padding: 4px 10px;
  border-radius: 12px;
}

/* Trace 唤起按钮特效 */
.trace-btn {
  cursor: pointer;
  background-color: #fce8e6;
  color: #d93025;
  transition: all 0.2s;
  font-weight: 500;
}
.trace-btn:hover {
  background-color: #fad2cf;
  transform: translateY(-1px);
}

/* 打字机 Loading */
.loading-pulse {
  display: flex;
  align-items: center;
  height: 24px;
  gap: 4px;
}
.dot {
  width: 6px;
  height: 6px;
  background-color: #a8c7fa;
  border-radius: 50%;
  animation: pulse 1.4s infinite ease-in-out both;
}
.dot:nth-child(1) { animation-delay: -0.32s; }
.dot:nth-child(2) { animation-delay: -0.16s; }

@keyframes pulse {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}

/* 底部输入区 */
.chat-footer {
  padding: 10px 20px 40px 20px; 
  background: linear-gradient(to top, rgba(255,255,255,1) 85%, rgba(255,255,255,0));
}

.input-wrapper {
  max-width: 840px;
  margin: 0 auto;
  position: relative;
  background-color: #f0f4f9;
  border-radius: 32px;
  padding: 14px 24px;
  display: flex;
  align-items: center;
  box-shadow: 0 2px 6px rgba(0,0,0,0.05);
}

.input-wrapper:focus-within {
  background-color: #ffffff;
  box-shadow: 0 2px 12px rgba(0,0,0,0.1);
}

:deep(.gemini-input .el-textarea__inner) {
  background-color: transparent !important;
  border: none !important;
  box-shadow: none !important;
  padding: 8px 0;
  font-size: 16px;
  line-height: 1.6;
  color: #202124;
  resize: none;
  min-height: 24px;
}
:deep(.gemini-input .el-textarea__inner::placeholder) {
  color: #80868b;
  font-size: 16px;
  line-height: 1.6;
}

.input-actions {
  margin-left: 16px;
  padding-bottom: 2px;
}

.send-btn {
  width: 42px;
  height: 42px;
  background-color: #000000;
  border-color: #000000;
  color: #ffffff;
  transition: transform 0.2s;
}
.send-btn:not(:disabled):hover {
  transform: scale(1.05);
  background-color: #202124;
  border-color: #202124;
}

/* 停止按钮 */
.stop-btn {
  width: 42px;
  height: 42px;
  background-color: #f1f3f4;
  border-color: #f1f3f4;
  transition: transform 0.2s;
  display: flex;
  justify-content: center;
  align-items: center;
}
.stop-btn:hover {
  background-color: #e8eaed;
  transform: scale(1.05);
}
.stop-icon {
  width: 14px;
  height: 14px;
  background-color: #5f6368;
  border-radius: 2px;
}

.footer-tip {
  text-align: center;
  font-size: 12px;
  color: #80868b;
  margin-top: 16px;
}

/* Trace 抽屉内极客风 UI */
.trace-container {
  padding: 0 10px;
}

.trace-header-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: #f8f9fa;
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 20px;
  border-left: 4px solid #dadce0;
}
.trace-status { font-weight: bold; font-size: 15px; }
.trace-status.success { color: #188038; border-color: #188038; }
.trace-status.error { color: #d93025; border-color: #d93025; }
.trace-id { font-size: 12px; color: #5f6368; font-family: monospace; }

.trace-error-box {
  margin-top: 15px;
  background-color: #fce8e6;
  color: #c5221f;
  padding: 12px;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.5;
}

/* 程序员黑框 Prompt 还原 */
.prompt-section { margin-bottom: 20px; }
.prompt-title {
  font-size: 14px;
  font-weight: 600;
  color: #202124;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
}
.prompt-title::before {
  content: ''; display: inline-block; width: 4px; height: 14px; background: #1a73e8; margin-right: 8px; border-radius: 2px;
}
.prompt-code {
  background-color: #282c34;
  color: #abb2bf;
  padding: 16px;
  border-radius: 8px;
  font-family: 'Courier New', Courier, monospace;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 400px;
  overflow-y: auto;
}

/* Trace 里的召回明细卡片 */
.trace-chunk-list { display: flex; flex-direction: column; gap: 16px; }
.trace-chunk-item {
  border: 1px solid #e8eaed;
  border-radius: 8px;
  padding: 16px;
  background-color: #fff;
  transition: box-shadow 0.2s;
}
.trace-chunk-item:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
.t-chunk-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.t-chunk-rank { font-weight: bold; color: #1a73e8; background: #e8f0fe; padding: 2px 8px; border-radius: 4px; font-size: 12px;}
.t-chunk-score { font-size: 12px; color: #188038; font-family: monospace; }
.t-chunk-meta { font-size: 12px; color: #80868b; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px dashed #e8eaed; }
.t-chunk-text { font-size: 13px; color: #3c4043; line-height: 1.6; white-space: pre-wrap; }
</style>