// src/utils/request.ts
import axios from 'axios'
import { ElMessage } from 'element-plus'

// 定义后端统一的响应结构
export interface ApiResponse<T = any> {
  code: number
  message: string
  data: T
  timestamp: number
}

// 定义分页通用返回结构
export interface PageData<T> {
  records: T[]
  total: number
  pageNo: number
  pageSize: number
}

// 普通 CRUD 请求，短超时（10秒）
const service = axios.create({
  baseURL: '',
  timeout: 10000
})

// AI/RAG 专用请求，长超时（2分钟）
const aiService = axios.create({
  baseURL: '',
  timeout: 120000
})

// AI 请求的响应拦截器
aiService.interceptors.response.use(
  (response) => {
    const res = response.data as ApiResponse
    if (res.code === 0) {
      return res.data
    }
    ElMessage.error(res.message || '请求失败')
    return Promise.reject(new Error(res.message || 'Error'))
  },
  (error) => {
    ElMessage.error(error.message || '网络错误')
    return Promise.reject(error)
  }
)

export { aiService }

// 响应拦截器
service.interceptors.response.use(
  (response) => {
    const res = response.data as ApiResponse
    // code 为 0 表示业务成功，直接返回 data 部分
    if (res.code === 0) {
      return res.data
    }
    // 业务报错，全局提示
    ElMessage.error(res.message || '请求失败')
    return Promise.reject(new Error(res.message || 'Error'))
  },
  (error) => {
    ElMessage.error(error.message || '网络错误')
    return Promise.reject(error)
  }
)

export default service