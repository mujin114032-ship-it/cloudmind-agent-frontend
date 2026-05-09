<!-- src/views/Chat.vue -->
<template>
  <div class="chat-layout-with-sidebar">
    <!-- 左侧会话边栏 -->
    <aside :class="['chat-sidebar', { 'is-collapsed': isSidebarCollapsed }]">
      <!-- 展开状态 (Full Sidebar) -->
      <div v-show="!isSidebarCollapsed" class="sidebar-full">
        <div class="sidebar-header">
          <div class="sidebar-top-actions">
            <el-tooltip content="收起菜单" placement="bottom" :show-after="500">
              <el-button class="sidebar-icon-btn" @click="isSidebarCollapsed = true">
                <el-icon><Menu /></el-icon>
              </el-button>
            </el-tooltip>
            <el-button class="sidebar-back-btn" @click="$router.push('/knowledge')">
              <el-icon style="margin-right: 8px; font-size: 16px;"><ArrowLeft /></el-icon> 返回知识库
            </el-button>
          </div>
          <el-button class="new-chat-btn" @click="createNewSession" :disabled="isGenerating">
            <el-icon style="margin-right: 8px; font-size: 18px;"><Plus /></el-icon> 新建对话
          </el-button>
        </div>

        <div class="session-list" v-loading="sessionsLoading">
          <div 
            v-for="session in sessionList" 
            :key="session.sessionId"
            :class="['session-item', { active: currentSessionId === session.sessionId }]"
            @click="selectSession(session)"
          >
            <el-icon class="session-icon"><ChatLineRound /></el-icon>
            <div class="session-info">
              <div class="session-title">{{ session.title }}</div>
            </div>
            
            <el-popconfirm title="确定删除此会话吗？" @confirm="handleDeleteSession(session.sessionId)" width="180">
              <template #reference>
                <div class="delete-icon-wrapper" @click.stop>
                  <el-icon class="delete-icon"><Delete /></el-icon>
                </div>
              </template>
            </el-popconfirm>
          </div>
          
          <el-empty v-if="!sessionsLoading && sessionList.length === 0" description="暂无历史对话" :image-size="60" />
        </div>
      </div>

      <!-- 收起状态 (Mini Sidebar) -->
      <div v-show="isSidebarCollapsed" class="sidebar-mini">
        <el-tooltip content="展开菜单" placement="right" :show-after="500">
          <el-button class="sidebar-icon-btn" @click="isSidebarCollapsed = false">
            <el-icon><Menu /></el-icon>
          </el-button>
        </el-tooltip>
        
        <el-tooltip content="新建对话" placement="right" :show-after="500">
          <el-button class="sidebar-icon-btn mini-new-chat" @click="createNewSession" :disabled="isGenerating">
            <el-icon><Plus /></el-icon>
          </el-button>
        </el-tooltip>

        <!-- 底部弹性占位，把返回按钮推到最下方 -->
        <div style="flex: 1"></div>

        <el-tooltip content="返回知识库" placement="right" :show-after="500">
          <el-button class="sidebar-icon-btn" @click="$router.push('/knowledge')">
            <el-icon><ArrowLeft /></el-icon>
          </el-button>
        </el-tooltip>
      </div>
    </aside>

    <!-- 右侧主聊天区 -->
    <div class="chat-main-area">
      <!-- 顶部导航栏 -->
      <header class="chat-header">
        <div class="header-left">
          <span class="header-title">{{ currentSession?.title || '新对话' }}</span>
        </div>
        
        <div class="header-right">
          <!-- 检索参数设置 -->
          <el-popover placement="bottom-end" title="设置" :width="300" trigger="click">
            <template #reference>
              <el-button round size="small" class="settings-btn">⚙️ 设置</el-button>
            </template>
            <el-form label-width="100px" size="small" style="margin-top: 15px;">
              <el-form-item label="流式输出">
                <el-switch v-model="ragConfig.useStream" />
              </el-form-item>
            </el-form>
          </el-popover>
        </div>
      </header>

      <!-- 聊天内容区 -->
      <main class="chat-main" ref="messageListRef" v-loading="messagesLoading">
        <div class="message-container">
          <!-- 初始空状态 -->
          <div v-if="messages.length === 0 && !messagesLoading" class="empty-state">
            <div class="gemini-sparkle-large">✨</div>
            <h2>今天想了解什么内容？</h2>
          </div>
          
          <div v-for="(msg, index) in messages" :key="msg.messageId || index" :class="['message-row', msg.role]">
            <!-- 用户消息 -->
            <div v-if="msg.role === 'user'" class="user-bubble">
              {{ msg.content }}
            </div>
            
            <!-- AI 消息 -->
            <div v-else class="ai-wrapper">
              <div class="ai-avatar" :class="{ 'spinning': msg.loading }">✨</div>
              <div class="ai-content">
                <!-- Loading 状态 -->
                <div v-if="msg.loading && !msg.content" class="loading-pulse">
                  <span class="dot"></span><span class="dot"></span><span class="dot"></span>
                </div>
                
                <!-- Markdown 正文渲染 -->
                <div 
                  v-show="msg.content" 
                  class="markdown-body" 
                  v-html="renderMarkdown(msg.content)"
                ></div>

                <!-- 异常提示 -->
                <el-alert 
                  v-if="msg.status === 2" 
                  :title="msg.errorMessage || '大模型调用失败'" 
                  type="error" 
                  show-icon 
                  :closable="false"
                  style="margin-top: 10px;"
                />

                <!-- 参考来源与耗时区 -->
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
                        <!-- 上下文扩展 UI 的应用 -->
                        <div 
                          v-for="(refItem, idx) in msg.references" 
                          :key="idx" 
                          :class="['reference-card', { 'is-context-expansion': refItem.hit === false }]"
                        >
                          <div class="ref-header">
                            <span class="ref-file">Context #{{ refItem.fileName }} (块 {{ refItem.chunkIndex }})</span>
                            
                            <div class="ref-tags">
                              <!-- 如果是核心命中节点 (hit !== false) -->
                              <template v-if="refItem.hit !== false">
                                <el-tag size="small" type="success" effect="dark" class="hit-tag">🎯 命中</el-tag>
                                
                                <!-- 混合检索来源标识 (忽略大小写防御性增强) -->
                                <template v-if="(refItem as any).recallSource">
                                  <el-tag size="small" type="primary" effect="plain" class="score-tag" style="background-color: #f3e8ff; border-color: #e9d5ff; color: #7e22ce;" v-if="String((refItem as any).recallSource).toLowerCase() === 'hybrid'">✨ 混合</el-tag>
                                  <el-tag size="small" type="primary" effect="plain" class="score-tag" style="background-color: #e0f2fe; border-color: #d8b4fe; color: #6b21a8;" v-else-if="String((refItem as any).recallSource).toLowerCase() === 'vector'">🔍 向量</el-tag>
                                  <el-tag size="small" type="primary" effect="plain" class="score-tag" style="background-color: #fdf4ff; border-color: #f5d0fe; color: #86198f;" v-else-if="String((refItem as any).recallSource).toLowerCase() === 'keyword'">📝 关键词</el-tag>
                                  <el-tag size="small" type="info" effect="plain" class="score-tag" v-else>来源: {{ (refItem as any).recallSource }}</el-tag>
                                </template>

                                <el-tooltip content="Reranker 评估的真实相关性排名" placement="top" v-if="(refItem as any).rerankRank != null">
                                  <el-tag size="small" type="primary" effect="plain" class="score-tag" style="cursor: help;">
                                    Rerank #{{ (refItem as any).rerankRank }}
                                  </el-tag>
                                </el-tooltip>
                                <el-tooltip content="向量检索基础打分" placement="top" v-if="(refItem as any).score != null">
                                  <el-tag size="small" type="info" class="score-tag" style="cursor: help;">
                                    V-Score: {{ (refItem as any).score?.toFixed(3) }}
                                  </el-tag>
                                </el-tooltip>
                                <el-tooltip content="关键词检索打分" placement="top" v-if="(refItem as any).keywordScore != null">
                                  <el-tag size="small" type="info" class="score-tag" style="cursor: help;">
                                    K-Score: {{ (refItem as any).keywordScore?.toFixed(3) }}
                                  </el-tag>
                                </el-tooltip>
                                <el-tooltip content="Reranker 交叉编码重排打分" placement="top" v-if="(refItem as any).rerankScore != null">
                                  <el-tag size="small" type="warning" class="score-tag rerank-score" style="cursor: help;">
                                    R-Score: {{ (refItem as any).rerankScore?.toFixed(3) }}
                                  </el-tag>
                                </el-tooltip>
                              </template>
                              
                              <!-- 如果是上下文扩展节点 (hit === false) -->
                              <template v-else>
                                <el-tag size="small" type="info" effect="plain" class="hit-tag">
                                  🔗 扩展 (距离 {{ ((refItem as any).distance || 0) > 0 ? '+' : '' }}{{ (refItem as any).distance || 0 }})
                                </el-tag>
                              </template>
                            </div>
                          </div>
                          <div class="ref-preview">{{ refItem.textPreview }}</div>
                        </div>
                      </div>
                    </el-collapse-item>
                  </el-collapse>
                  
                  <!-- 元数据统计 -->
                  <div class="meta-info" v-if="msg.totalCostMs !== undefined">
                    <el-tooltip content="模型与策略信息" placement="top">
                      <span class="meta-item">
                        🤖 {{ msg.llmCostMs }}ms | 
                        <span style="color: #1a73e8; font-weight: 500;">
                          {{ msg.promptVersion || 'basic-v1' }} ({{ msg.searchMode || 'balanced' }})
                        </span>
                      </span>
                    </el-tooltip>
                    <el-tooltip content="向量检索耗时" placement="top">
                      <span class="meta-item">🔍 检索: {{ msg.retrievalCostMs }}ms</span>
                    </el-tooltip>
                    <span v-if="msg.traceId" class="meta-item trace-btn" @click="openTraceDrawer(msg.traceId)">
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
            :disabled="isGenerating || sessionsLoading"
          />
          <div class="input-actions">

            <!-- 1. 检索模式 下拉切换器 (新增) -->
            <el-dropdown 
              placement="top-end" 
              @command="(cmd: 'fast' | 'balanced' | 'quality') => ragConfig.searchMode = cmd"
              trigger="click"
            >
              <div class="prompt-selector-trigger" style="margin-right: 4px;">
                <!-- 动态颜色指示灯：快速绿，均衡蓝，深度紫 -->
                <span class="prompt-dot" :style="{ backgroundColor: ragConfig.searchMode === 'quality' ? '#8b5cf6' : (ragConfig.searchMode === 'fast' ? '#10b981' : '#1a73e8') }"></span>
                <span class="prompt-name">{{ currentSearchModeName }}</span>
                <el-icon style="margin-left: 4px; font-size: 12px;"><ArrowUp /></el-icon>
              </div>
              <template #dropdown>
                <el-dropdown-menu class="prompt-dropdown-menu">
                  <el-dropdown-item 
                    v-for="mode in searchModes" 
                    :key="mode.value" 
                    :command="mode.value"
                    :class="{ 'is-active': ragConfig.searchMode === mode.value }"
                  >
                    {{ mode.label }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>

            <!-- 2. 回答风格(Prompt) 下拉切换器 -->
            <el-dropdown 
              v-if="promptTemplates.length > 0" 
              placement="top-end" 
              @command="(cmd: string) => ragConfig.promptVersion = cmd"
              trigger="click"
            >
              <div class="prompt-selector-trigger">
                <span class="prompt-dot"></span>
                <span class="prompt-name">{{ currentPromptName }}</span>
                <el-icon style="margin-left: 4px; font-size: 12px;"><ArrowUp /></el-icon>
              </div>
              <template #dropdown>
                <el-dropdown-menu class="prompt-dropdown-menu">
                  <el-dropdown-item 
                    v-for="tpl in promptTemplates" 
                    :key="tpl.version" 
                    :command="tpl.version"
                    :class="{ 'is-active': ragConfig.promptVersion === tpl.version }"
                  >
                    {{ tpl.name.replace(' Prompt', '').replace('问答', '').replace('回答', '') }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>

            <!-- 发送/停止按钮 -->
            <el-button 
              v-if="!isGenerating"
              type="primary" 
              circle 
              class="send-btn" 
              :disabled="!inputQuery.trim() || sessionsLoading"
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
    </div>

    <!-- RAG Trace 抽屉 -->
    <el-drawer v-model="traceDrawerVisible" title="🛠️ RAG 执行链路分析" size="700px">
      <div class="trace-container" v-loading="traceLoading">
        <template v-if="traceData">
          <div class="trace-header-card">
            <div class="trace-status" :class="traceData.status === 1 ? 'success' : 'error'">
              {{ traceData.status === 1 ? '✅ 生成成功' : '❌ 生成失败' }}
            </div>
            <div class="trace-id">ID: {{ traceData.traceId }}</div>
          </div>

          <el-tabs v-model="activeTraceTab" class="trace-tabs">
            <el-tab-pane label="⏱️ 基础分析" name="basic">
              <el-descriptions :column="1" border size="small">
                <el-descriptions-item label="原始问题">{{ traceData.originalQuestion }}</el-descriptions-item>
                <el-descriptions-item label="改写问题">{{ traceData.finalQuestion }}</el-descriptions-item>
                <el-descriptions-item label="检索耗时"><span style="color: #E6A23C">{{ traceData.retrievalCostMs }} ms</span></el-descriptions-item>
                <el-descriptions-item label="生成耗时"><span style="color: #67C23A">{{ traceData.llmCostMs }} ms</span></el-descriptions-item>
                <el-descriptions-item label="总耗时"><strong>{{ traceData.totalCostMs }} ms</strong></el-descriptions-item>
                <el-descriptions-item label="大模型">{{ traceData.modelName }}</el-descriptions-item>
                <el-descriptions-item label="Prompt">{{ traceData.promptVersion || '默认版本' }}</el-descriptions-item>
                <el-descriptions-item label="检索模式">{{ (traceData as any).searchMode || '默认模式' }}</el-descriptions-item>
              </el-descriptions>
              <div v-if="traceData.errorMessage" class="trace-error-box">
                <strong>报错信息：</strong><br/>{{ traceData.errorMessage }}
              </div>
            </el-tab-pane>

            <el-tab-pane label="📝 Prompt 还原" name="prompt">
              <div class="prompt-section">
                <div class="prompt-title">System Prompt</div>
                <pre class="prompt-code">{{ traceData.systemPrompt || '未获取到' }}</pre>
              </div>
              <div class="prompt-section">
                <div class="prompt-title">User Prompt (含注入片段)</div>
                <pre class="prompt-code">{{ traceData.userPrompt || '未获取到' }}</pre>
              </div>
            </el-tab-pane>

            <el-tab-pane label="🎯 召回明细" name="chunks">
              <el-alert v-if="!traceData.chunks || traceData.chunks.length === 0" title="本次检索没有召回任何 Chunk" type="info" :closable="false" />
              <div class="trace-chunk-list">
                <div v-for="(chunk, idx) in traceData.chunks" :key="chunk.chunkId" class="trace-chunk-item">
                  <div class="t-chunk-header">
                    <!-- 状态标识与悬浮精准释义 -->
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <el-tooltip placement="top">
                        <template #content>
                          <div style="line-height: 1.6; font-size: 13px; font-family: monospace;">
                            {{ getChunkTooltip(chunk, idx, traceData.chunks || []) }}
                          </div>
                        </template>
                        <span class="t-chunk-rank" style="cursor: help;">Context #{{ idx + 1 }}</span>
                      </el-tooltip>
                      <el-tag v-if="(chunk as any).hit === false" size="small" type="info" effect="plain" class="hit-tag">🔗 扩展</el-tag>
                      <el-tag v-else-if="(chunk as any).hit !== false" size="small" type="success" effect="dark" class="hit-tag">🎯 命中</el-tag>
                    </div>
                    <!-- 混合检索标识与双重打分展示 -->
                    <div class="ref-tags">
                      <template v-if="(chunk as any).recallSource">
                        <el-tag size="small" type="primary" effect="plain" class="score-tag" style="background-color: #f3e8ff; border-color: #e9d5ff; color: #7e22ce;" v-if="String((chunk as any).recallSource).toLowerCase() === 'hybrid'">✨ 混合</el-tag>
                        <el-tag size="small" type="primary" effect="plain" class="score-tag" style="background-color: #e0f2fe; border-color: #d8b4fe; color: #6b21a8;" v-else-if="String((chunk as any).recallSource).toLowerCase() === 'vector'">🔍 向量</el-tag>
                        <el-tag size="small" type="primary" effect="plain" class="score-tag" style="background-color: #fdf4ff; border-color: #f5d0fe; color: #86198f;" v-else-if="String((chunk as any).recallSource).toLowerCase() === 'keyword'">📝 关键词</el-tag>
                        <el-tag size="small" type="info" effect="plain" class="score-tag" v-else>来源: {{ (chunk as any).recallSource }}</el-tag>
                      </template>

                      <el-tooltip content="Reranker 评估的真实相关性排名" placement="top" v-if="(chunk as any).rerankRank != null">
                        <el-tag size="small" type="primary" effect="plain" class="score-tag" style="cursor: help;">
                          Rerank #{{ (chunk as any).rerankRank }}
                        </el-tag>
                      </el-tooltip>
                      <el-tooltip content="向量检索基础打分" placement="top" v-if="(chunk as any).score != null">
                        <el-tag size="small" type="info" class="score-tag" style="cursor: help;">V-Score: {{ chunk.score.toFixed(4) }}</el-tag>
                      </el-tooltip>
                      <el-tooltip content="关键词检索打分" placement="top" v-if="(chunk as any).keywordScore != null">
                        <el-tag size="small" type="info" class="score-tag" style="cursor: help;">K-Score: {{ (chunk as any).keywordScore.toFixed(4) }}</el-tag>
                      </el-tooltip>
                      <el-tooltip content="Reranker 交叉编码重排打分" placement="top" v-if="(chunk as any).rerankScore != null">
                        <el-tag size="small" type="warning" class="score-tag rerank-score" style="cursor: help;">
                          R-Score: {{ (chunk as any).rerankScore.toFixed(4) }}
                        </el-tag>
                      </el-tooltip>
                    </div>
                  </div>
                  <div class="t-chunk-meta">
                    来源：{{ chunk.fileName }} (分块 {{ chunk.chunkIndex }})
                    <span v-if="(chunk as any).distance"> | 距离: {{ (chunk as any).distance > 0 ? '+' : '' }}{{ (chunk as any).distance }}</span>
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
import { ref, reactive, computed, nextTick, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Right, Plus, Delete, ChatLineRound, Menu, ArrowUp } from '@element-plus/icons-vue'
import MarkdownIt from 'markdown-it'

import { 
  createChatSession, 
  getChatSessionList, 
  getChatMessageList, 
  deleteChatSession, 
  sessionRagQa,
  sessionStreamRagQa
} from '@/api/chat'
import type { ChatSessionVO, ChatMessageVO } from '@/api/chat'
import { getTraceDetail, getPromptTemplates } from '@/api/knowledge'
import type { RagTraceVO, PromptTemplateVO } from '@/api/knowledge'

const route = useRoute()
const knowledgeBaseId = route.params.knowledgeBaseId as string
const md = new MarkdownIt({ breaks: true, linkify: true })

// --- 侧边栏与下拉选项配置 ---
const isSidebarCollapsed = ref(false)
const sessionList = ref<ChatSessionVO[]>([])
const currentSessionId = ref<string>('')
const sessionsLoading = ref(false)
const promptTemplates = ref<PromptTemplateVO[]>([]) 

// 新增：预置的 Search Mode 配置项
const searchModes = [
  { value: 'fast', label: '快速模式 (速度优先)', short: '快速' },
  { value: 'balanced', label: '均衡模式 (智能推荐)', short: '均衡' },
  { value: 'quality', label: '深度模式 (质量优先)', short: '深度' }
]

const currentSession = computed(() => {
  return sessionList.value.find(s => s.sessionId === currentSessionId.value)
})

// --- 消息与输入状态 ---
const messages = ref<ChatMessageVO[]>([])
const messagesLoading = ref(false)
const inputQuery = ref('')
const isGenerating = ref(false)
const messageListRef = ref<HTMLDivElement | null>(null)
let abortController: AbortController | null = null

// 更新配置项，加入 searchMode
const ragConfig = reactive({
  useStream: true, 
  topK: 5,
  scoreThreshold: 0.3,
  promptVersion: 'basic-v1',
  searchMode: 'balanced' as 'fast' | 'balanced' | 'quality'
})

// --- Trace 状态 ---
const traceDrawerVisible = ref(false)
const traceLoading = ref(false)
const traceData = ref<RagTraceVO | null>(null)
const activeTraceTab = ref('basic')

// --- 工具函数 ---
const currentSearchModeName = computed(() => {
  return searchModes.find(m => m.value === ragConfig.searchMode)?.short || '均衡'
})

const currentPromptName = computed(() => {
  const tpl = promptTemplates.value.find(t => t.version === ragConfig.promptVersion)
  if (!tpl) return '基础'
  return tpl.name.replace(' Prompt', '').replace('问答', '').replace('回答', '')
})

const getChunkTooltip = (chunk: any, index: number, allChunks: any[]) => {
  const contextStr = `Context #${index + 1}`
  
  if (chunk.hit !== false) {
    let sourceLabel = ''
    if (chunk.recallSource) {
      const rs = String(chunk.recallSource).toLowerCase()
      if (rs === 'vector') sourceLabel = ' | 向量召回'
      else if (rs === 'keyword') sourceLabel = ' | 关键词召回'
      else if (rs === 'hybrid') sourceLabel = ' | 混合召回'
      else sourceLabel = ` | ${chunk.recallSource}`
    }

    const rerankStr = chunk.rerankRank != null ? ` | Rerank #${chunk.rerankRank}` : ''
    const vScoreStr = chunk.score != null ? ` | V-Score: ${chunk.score.toFixed(4)}` : ''
    const kScoreStr = chunk.keywordScore != null ? ` | K-Score: ${chunk.keywordScore.toFixed(4)}` : ''
    const rScoreStr = chunk.rerankScore != null ? ` | R-Score: ${chunk.rerankScore.toFixed(4)}` : ''
    return `${contextStr} | 命中${sourceLabel}${rerankStr}${vScoreStr}${kScoreStr}${rScoreStr}`
  } else {
    const dist = chunk.distance || 0
    const distanceStr = ` | 扩展 距离 ${dist > 0 ? '+' : ''}${dist}`
    let sourceStr = ''
    if (chunk.sourceChunkId && allChunks) {
      const sourceChunk = allChunks.find(c => c.chunkId === chunk.sourceChunkId)
      if (sourceChunk && sourceChunk.rerankRank != null) {
        sourceStr = ` | 来源 Rerank #${sourceChunk.rerankRank}`
      }
    }
    return `${contextStr}${distanceStr}${sourceStr}`
  }
}

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

// 0. 获取 Prompt 模板列表
const fetchPromptTemplates = async () => {
  try {
    const res = await getPromptTemplates()
    promptTemplates.value = res
    if (res.length > 0 && !res.find(t => t.version === ragConfig.promptVersion)) {
      ragConfig.promptVersion = res[0].version
    }
  } catch (error) {
    // 静默失败即可
  }
}

// 1. 获取会话列表
const fetchSessions = async () => {
  try {
    sessionsLoading.value = true
    const res = await getChatSessionList({ knowledgeBaseId, pageNo: 1, pageSize: 50 })
    sessionList.value = res.records
  } catch (error) {
    //
  } finally {
    sessionsLoading.value = false
  }
}

// 2. 点击新建会话
const createNewSession = () => {
  currentSessionId.value = ''
  messages.value = []
}

// 3. 选择某一个会话
const selectSession = async (session: ChatSessionVO) => {
  if (isGenerating.value) return
  currentSessionId.value = session.sessionId
  try {
    messagesLoading.value = true
    const res = await getChatMessageList(session.sessionId, { pageNo: 1, pageSize: 100 })
    messages.value = res.records 
    scrollToBottom()
  } catch (error) {
    ElMessage.error('加载历史消息失败')
  } finally {
    messagesLoading.value = false
  }
}

// 4. 删除会话
const handleDeleteSession = async (sessionId: string) => {
  try {
    await deleteChatSession(sessionId)
    ElMessage.success('会话已删除')
    if (currentSessionId.value === sessionId) {
      currentSessionId.value = ''
      messages.value = []
    }
    fetchSessions()
  } catch (error) {
    //
  }
}

// 5. 核心发送逻辑 
const handleSend = async () => {
  const question = inputQuery.value.trim()
  if (!question) return

  inputQuery.value = ''
  isGenerating.value = true

  let targetSessionId = currentSessionId.value
  if (!targetSessionId) {
    const title = question.length > 15 ? question.slice(0, 15) + '...' : question
    const newSession = await createChatSession({ knowledgeBaseId, title })
    targetSessionId = newSession.sessionId
    currentSessionId.value = targetSessionId
    fetchSessions()
  }

  const tempUserMsgId = 'temp_user_' + Date.now()
  const tempAiMsgId = 'temp_ai_' + Date.now()
  
  messages.value.push({
    messageId: tempUserMsgId,
    sessionId: targetSessionId,
    role: 'user',
    content: question,
    status: 1,
    createTime: new Date().toISOString()
  })
  
  messages.value.push({
    messageId: tempAiMsgId,
    sessionId: targetSessionId,
    role: 'assistant',
    content: '',
    status: 1,
    loading: true,
    createTime: new Date().toISOString()
  })
  scrollToBottom()

  abortController = new AbortController()

  // 发送 Payload 时，附加 searchMode
  const requestPayload = {
    question, 
    topK: ragConfig.topK, 
    scoreThreshold: ragConfig.scoreThreshold,
    promptVersion: ragConfig.promptVersion,
    searchMode: ragConfig.searchMode
  }

  try {
    if (ragConfig.useStream) {
      let aiMsgRef: ChatMessageVO | undefined 

      await sessionStreamRagQa(
        targetSessionId,
        requestPayload,
        {
          onMessageCreated: (data) => {
            const uIdx = messages.value.findIndex(m => m.messageId === tempUserMsgId)
            if (uIdx !== -1) messages.value.splice(uIdx, 1, data.userMessage)
            
            const aIdx = messages.value.findIndex(m => m.messageId === tempAiMsgId)
            if (aIdx !== -1) {
              data.assistantMessage.loading = true 
              messages.value.splice(aIdx, 1, data.assistantMessage)
              aiMsgRef = messages.value[aIdx]
            }
            if (data.traceId && aiMsgRef) aiMsgRef.traceId = data.traceId
          },
          onRetrievalDone: (data) => {
            if (aiMsgRef) {
              aiMsgRef.references = data.references
              if (data.traceId) aiMsgRef.traceId = data.traceId
            }
          },
          onDelta: (data) => {
            if (aiMsgRef) {
              if (aiMsgRef.loading) aiMsgRef.loading = false
              aiMsgRef.content += (data.content || '')
              if (data.traceId) aiMsgRef.traceId = data.traceId
              scrollToBottom()
            }
          },
          onDone: (data) => {
            if (aiMsgRef) {
              aiMsgRef.loading = false
              aiMsgRef.content = data.answer || aiMsgRef.content
              aiMsgRef.traceId = data.traceId || aiMsgRef.traceId
              
              if (data.promptVersion) aiMsgRef.promptVersion = data.promptVersion 
              if (data.searchMode) aiMsgRef.searchMode = data.searchMode 

              aiMsgRef.retrievalCostMs = data.retrievalCostMs
              aiMsgRef.llmCostMs = data.llmCostMs
              aiMsgRef.totalCostMs = data.totalCostMs
              aiMsgRef.references = data.assistantMessage?.references || aiMsgRef.references
            }
            isGenerating.value = false
            abortController = null
            fetchSessions() 
            scrollToBottom()
          },
          onError: (errMessage) => {
            if (aiMsgRef) {
              aiMsgRef.loading = false
              aiMsgRef.status = 2 
              aiMsgRef.errorMessage = errMessage
            }
            isGenerating.value = false
            abortController = null
          }
        },
        abortController.signal
      )
    } else {
      const res = await sessionRagQa(targetSessionId, requestPayload)

      const uIdx = messages.value.findIndex(m => m.messageId === tempUserMsgId)
      if (uIdx !== -1) messages.value.splice(uIdx, 1, res.userMessage)
      
      const aIdx = messages.value.findIndex(m => m.messageId === tempAiMsgId)
      if (aIdx !== -1) {
         if ((res as any).promptVersion || res.assistantMessage?.promptVersion) {
            res.assistantMessage.promptVersion = (res as any).promptVersion || res.assistantMessage.promptVersion
         }
         if ((res as any).searchMode || (res.assistantMessage as any)?.searchMode) {
            (res.assistantMessage as any).searchMode = (res as any).searchMode || (res.assistantMessage as any).searchMode
         }
         messages.value.splice(aIdx, 1, res.assistantMessage)
      }
      
      fetchSessions()
      isGenerating.value = false
      abortController = null
      scrollToBottom()
    }
  } catch (error: any) {
    if (error.name !== 'AbortError') {
      const aIdx = messages.value.findIndex(m => m.messageId === tempAiMsgId)
      if (aIdx !== -1) {
        messages.value[aIdx].loading = false
        messages.value[aIdx].status = 2
        messages.value[aIdx].errorMessage = '网络请求发生错误，请稍后重试。'
      }
    }
    isGenerating.value = false
    abortController = null
  }
}

const openTraceDrawer = async (traceId: string) => {
  activeTraceTab.value = 'basic'
  traceDrawerVisible.value = true
  try {
    traceLoading.value = true
    traceData.value = await getTraceDetail(traceId)
  } catch (error) {
    ElMessage.error('获取 Trace 链路详情失败')
  } finally {
    traceLoading.value = false
  }
}

onMounted(() => {
  fetchPromptTemplates() 
  fetchSessions()
})
</script>

<style scoped>
/* === 左侧边栏 === */
.chat-layout-with-sidebar { display: flex; height: 100vh; background-color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
.chat-sidebar { width: 280px; background-color: #f0f4f9; border-right: none; display: flex; flex-direction: column; flex-shrink: 0; transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1); overflow: hidden; }
.chat-sidebar.is-collapsed { width: 68px; }
.sidebar-full { width: 280px; display: flex; flex-direction: column; height: 100%; padding: 12px; box-sizing: border-box; }
.sidebar-header { display: flex; flex-direction: column; gap: 16px; padding: 8px 4px 24px 4px; }
.sidebar-top-actions { display: flex; align-items: center; gap: 8px; }
.sidebar-icon-btn { width: 40px; height: 40px; border: none; background: transparent; color: #444746; font-size: 20px; border-radius: 50%; display: flex; justify-content: center; align-items: center; padding: 0; transition: background-color 0.2s; }
.sidebar-icon-btn:hover { background-color: #e1e5ea; color: #1f1f1f; }
.sidebar-back-btn { background: transparent; border: none; color: #444746; justify-content: flex-start; padding: 8px 12px; font-size: 14px; font-weight: 500; border-radius: 8px; box-shadow: none; flex: 1; }
.sidebar-back-btn:hover { background-color: #e1e5ea; color: #1f1f1f; }
.new-chat-btn { background-color: #c2e7ff; color: #001d35; border: none; border-radius: 16px; padding: 20px 16px; justify-content: flex-start; font-size: 15px; font-weight: 500; transition: all 0.2s ease; }
.new-chat-btn:hover { background-color: #b1dcfb; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.session-list { flex: 1; overflow-y: auto; padding-right: 4px; }
.session-list::-webkit-scrollbar { width: 4px; }
.session-list::-webkit-scrollbar-thumb { background: #dadce0; border-radius: 4px; }
.session-item { display: flex; align-items: center; padding: 12px 16px; margin-bottom: 4px; border-radius: 50px; cursor: pointer; transition: background-color 0.2s; color: #444746; }
.session-icon { font-size: 18px; margin-right: 12px; flex-shrink: 0; }
.session-item:hover { background-color: #e1e5ea; }
.session-item.active { background-color: #d3e3fd; color: #041e49; }
.session-info { flex: 1; overflow: hidden; }
.session-title { font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; }
.session-item.active .session-title { font-weight: 600; }
.delete-icon-wrapper { opacity: 0; padding: 6px; border-radius: 50%; color: #5f6368; display: flex; align-items: center; justify-content: center; transition: opacity 0.2s, background-color 0.2s; }
.session-item:hover .delete-icon-wrapper { opacity: 1; }
.delete-icon-wrapper:hover { background-color: rgba(0,0,0,0.08); color: #d93025; }
.sidebar-mini { width: 68px; display: flex; flex-direction: column; align-items: center; height: 100%; padding: 12px 0 24px 0; box-sizing: border-box; gap: 16px; }
.mini-new-chat { background-color: #c2e7ff; color: #001d35; }
.mini-new-chat:hover { background-color: #b1dcfb; }

/* === 右侧主聊天区 === */
.chat-main-area { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.chat-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 24px; background: rgba(255, 255, 255, 0.9); backdrop-filter: blur(8px); position: sticky; top: 0; z-index: 10; border-bottom: 1px solid #f1f3f4; }
.header-title { font-size: 16px; font-weight: 500; color: #202124; }
.settings-btn { background-color: #f1f3f4; border: none; color: #5f6368; }
.chat-main { flex: 1; overflow-y: auto; padding-bottom: 20px; scroll-behavior: smooth; }
.message-container { max-width: 800px; margin: 0 auto; padding: 40px 20px 20px 20px; }
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; margin-top: 10vh; color: #202124; }
.gemini-sparkle-large { font-size: 48px; margin-bottom: 20px; animation: float 3s ease-in-out infinite; }
@keyframes float { 0% { transform: translateY(0px); } 50% { transform: translateY(-10px); } 100% { transform: translateY(0px); } }
.empty-state h2 { font-weight: 400; font-size: 24px; }
.message-row { margin-bottom: 32px; display: flex; width: 100%; }
.message-row.user { justify-content: flex-end; }
.user-bubble { background-color: #f0f4f9; color: #202124; padding: 12px 20px; border-radius: 24px 24px 4px 24px; font-size: 15px; line-height: 1.6; max-width: 80%; white-space: pre-wrap; }
.ai-wrapper { display: flex; align-items: flex-start; gap: 16px; width: 100%; }
.ai-avatar { font-size: 24px; line-height: 1; flex-shrink: 0; margin-top: 2px; }
.ai-avatar.spinning { animation: subtlePulse 1.5s infinite; }
@keyframes subtlePulse { 0% { transform: scale(1); opacity: 0.8; } 50% { transform: scale(1.1); opacity: 1; } 100% { transform: scale(1); opacity: 0.8; } }
.ai-content { flex: 1; min-width: 0; }
:deep(.markdown-body) { font-size: 15px; line-height: 1.7; color: #202124; background: transparent; }
:deep(.markdown-body p) { margin-bottom: 1em; }
:deep(.markdown-body p:last-child) { margin-bottom: 0; }
:deep(.markdown-body pre) { background-color: #f8f9fa; border-radius: 8px; border: 1px solid #e8eaed; }
:deep(.markdown-body blockquote) { border-left: 4px solid #e8eaed; padding-left: 16px; color: #5f6368; margin: 0; }
.reference-section { margin-top: 24px; }
.no-ref-alert { margin-bottom: 12px; border-radius: 8px; }
:deep(.ref-collapse) { border: none; }
:deep(.el-collapse-item__header) { background-color: transparent; border-bottom: none; height: 36px; line-height: 36px; color: #5f6368; }
:deep(.el-collapse-item__wrap) { background-color: transparent; border-bottom: none; }
.ref-title-icon { margin-right: 8px; }
.ref-title-text { font-size: 13px; font-weight: 500; }
.ref-cards-container { display: flex; flex-direction: column; gap: 12px; padding-top: 8px; }

/* 上下文扩展卡片 UI */
.reference-card { background-color: #f8f9fa; border: 1px solid #e8eaed; border-radius: 12px; padding: 12px 16px; }
.reference-card.is-context-expansion { background-color: #fafbfc; border: 1px dashed #dcdfe6; opacity: 0.9; }
.ref-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.ref-file { font-size: 13px; font-weight: 600; color: #202124; }
.hit-tag { font-family: monospace; border-radius: 10px; }
.ref-preview { font-size: 13px; color: #5f6368; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }

.meta-info { margin-top: 16px; display: flex; gap: 12px; flex-wrap: wrap; }
.meta-item { font-size: 12px; color: #80868b; background-color: #f1f3f4; padding: 4px 10px; border-radius: 12px; }
.trace-btn { cursor: pointer; background-color: #fce8e6; color: #d93025; transition: all 0.2s; font-weight: 500; }
.trace-btn:hover { background-color: #fad2cf; transform: translateY(-1px); }
.loading-pulse { display: flex; align-items: center; height: 24px; gap: 4px; }
.dot { width: 6px; height: 6px; background-color: #a8c7fa; border-radius: 50%; animation: pulse 1.4s infinite ease-in-out both; }
.dot:nth-child(1) { animation-delay: -0.32s; }
.dot:nth-child(2) { animation-delay: -0.16s; }
@keyframes pulse { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }

/* 底部输入区 */
.chat-footer { padding: 10px 20px 40px 20px; background: linear-gradient(to top, rgba(255,255,255,1) 85%, rgba(255,255,255,0)); }

.input-wrapper { max-width: 840px; margin: 0 auto; position: relative; background-color: #f0f4f9; border-radius: 32px; padding: 14px 24px; display: flex; align-items: center; box-shadow: 0 2px 6px rgba(0,0,0,0.05); }
.input-wrapper:focus-within { background-color: #ffffff; box-shadow: 0 2px 12px rgba(0,0,0,0.1); }
:deep(.gemini-input .el-textarea__inner) { background-color: transparent !important; border: none !important; box-shadow: none !important; padding: 8px 0; font-size: 16px; line-height: 1.6; color: #202124; resize: none; min-height: 24px; }
:deep(.gemini-input .el-textarea__inner::placeholder) { color: #80868b; font-size: 16px; line-height: 1.6; }
.input-actions { 
  margin-left: 16px; 
  padding-bottom: 2px; 
  display: flex;
  align-items: center;
  gap: 8px; /* 调小间距让两个胶囊更紧凑 */
}

.prompt-selector-trigger {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  border-radius: 16px;
  font-size: 13px;
  font-weight: 500;
  color: #444746;
  cursor: pointer;
  background-color: transparent;
  transition: background-color 0.2s;
  user-select: none;
}
.prompt-selector-trigger:hover {
  background-color: #e1e5ea;
}
.prompt-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #1a73e8;
  margin-right: 6px;
  transition: background-color 0.3s ease;
}
.prompt-name {
  max-width: 80px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 下拉菜单精调 */
:deep(.prompt-dropdown-menu) {
  border-radius: 12px;
  padding: 8px;
  min-width: 160px;
}
:deep(.prompt-dropdown-menu .el-dropdown-item) {
  border-radius: 8px;
  margin-bottom: 2px;
  font-size: 13px;
  color: #444746;
}
:deep(.prompt-dropdown-menu .el-dropdown-item.is-active) {
  background-color: #e8f0fe;
  color: #1a73e8;
  font-weight: 600;
}
.send-btn { width: 42px; height: 42px; background-color: #000000; border-color: #000000; color: #ffffff; transition: transform 0.2s; margin-left: 4px; }
.send-btn:not(:disabled):hover { transform: scale(1.05); background-color: #202124; border-color: #202124; }
.stop-btn { width: 42px; height: 42px; background-color: #f1f3f4; border-color: #f1f3f4; transition: transform 0.2s; display: flex; justify-content: center; align-items: center; margin-left: 4px; }
.stop-btn:hover { background-color: #e8eaed; transform: scale(1.05); }
.stop-icon { width: 14px; height: 14px; background-color: #5f6368; border-radius: 2px; }
.footer-tip { text-align: center; font-size: 12px; color: #80868b; margin-top: 16px; }

/* Trace 抽屉 */
.trace-container { padding: 0 10px; }
.trace-header-card { display: flex; justify-content: space-between; align-items: center; background-color: #f8f9fa; padding: 12px 16px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #dadce0; }
.trace-status { font-weight: bold; font-size: 15px; }
.trace-status.success { color: #188038; border-color: #188038; }
.trace-status.error { color: #d93025; border-color: #d93025; }
.trace-id { font-size: 12px; color: #5f6368; font-family: monospace; }
.trace-error-box { margin-top: 15px; background-color: #fce8e6; color: #c5221f; padding: 12px; border-radius: 6px; font-size: 13px; line-height: 1.5; }
.prompt-section { margin-bottom: 20px; }
.prompt-title { font-size: 14px; font-weight: 600; color: #202124; margin-bottom: 8px; display: flex; align-items: center; }
.prompt-title::before { content: ''; display: inline-block; width: 4px; height: 14px; background: #1a73e8; margin-right: 8px; border-radius: 2px; }
.prompt-code { background-color: #282c34; color: #abb2bf; padding: 16px; border-radius: 8px; font-family: 'Courier New', Courier, monospace; font-size: 13px; line-height: 1.5; white-space: pre-wrap; word-break: break-all; max-height: 400px; overflow-y: auto; }
.trace-chunk-list { display: flex; flex-direction: column; gap: 16px; }
.trace-chunk-item { border: 1px solid #e8eaed; border-radius: 8px; padding: 16px; background-color: #fff; transition: box-shadow 0.2s; }
.trace-chunk-item:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
.t-chunk-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.t-chunk-rank { font-weight: bold; color: #1a73e8; background: #e8f0fe; padding: 2px 8px; border-radius: 4px; font-size: 12px;}
.t-chunk-meta { font-size: 12px; color: #80868b; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px dashed #e8eaed; }
.t-chunk-text { font-size: 13px; color: #3c4043; line-height: 1.6; white-space: pre-wrap; }
.ref-tags {
  display: flex;
  align-items: center;
  gap: 6px;
}
.score-tag {
  font-family: monospace;
  border-radius: 4px;
}
.score-tag.rerank-score {
  background-color: #fff8e6;
  border-color: #faecd8;
  color: #e6a23c;
  font-weight: 600;
}
</style>