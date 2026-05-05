// src/router/index.ts
import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/knowledge'
  },
  {
    path: '/knowledge',
    name: 'Knowledge',
    component: () => import('@/views/KnowledgeList.vue')
  },
  {
    path: '/knowledge/:knowledgeBaseId/documents',
    name: 'Document',
    component: () => import('@/views/DocumentList.vue')
  },
  {
    path: '/knowledge/:knowledgeBaseId/chat',
    name: 'KnowledgeChat',
    component: () => import('@/views/Chat.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router