import { useState, useEffect } from 'react'
import axios from 'axios'
import HeatMap from 'react-calendar-heatmap'
import 'react-calendar-heatmap/dist/styles.css'

// 根据环境决定 API 地址
// const API_BASE = import.meta.env.PROD ? '' : '/api'

interface Child {
  id: string
  name: string
  pet_type: string
  total_score: number
  pet_level: number
  created_at: string
}

interface Task {
  id: string
  name: string
  category: string
  points: number
  daily_limit: number
  is_active: boolean
}

interface CheckinResult {
  pointsEarned: number
  oldTotal: number
  newTotal: number
  oldLevel: number
  newLevel: number
  leveledUp: boolean
}

function App() {
  // ========== 状态 ==========
  const [isLogin, setIsLogin] = useState(true)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  
  const [userId, setUserId] = useState<string | null>(null)
  const [children, setChildren] = useState<Child[]>([])
  const [selectedChild, setSelectedChild] = useState<Child | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [showChildForm, setShowChildForm] = useState(false)
  const [newChildName, setNewChildName] = useState('')
  const [newChildPet, setNewChildPet] = useState('cat')
  
  const [checkinResult, setCheckinResult] = useState<CheckinResult | null>(null)
  const [checkins, setCheckins] = useState<any[]>([])
  const [showCheckins, setShowCheckins] = useState(false)

  const [showShop, setShowShop] = useState(false)
  const [rewards, setRewards] = useState<any[]>([])
  const [newRewardName, setNewRewardName] = useState('')
  const [newRewardCost, setNewRewardCost] = useState('')
  const [showRedemptions, setShowRedemptions] = useState(false)
  const [redemptions, setRedemptions] = useState<any[]>([])
  
  const [showStats, setShowStats] = useState(false)
  const [heatmapData, setHeatmapData] = useState<{ date: string; count: number }[]>([])

  // ========== 登录/注册 ==========
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage('')
    setCheckinResult(null)

    try {
      const url = isLogin ? '/api/login' : '/api/register'
      const response = await axios.post(url, { username, password })
      
      if (response.data.success) {
        setMessage(`✅ ${response.data.message}`)
        if (isLogin) {
          const user = response.data.user
          setUserId(user.id)
          localStorage.setItem('userId', user.id)
          localStorage.setItem('username', user.username)
        }
      }
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || '请求失败，请稍后重试'
      setMessage(`❌ ${errorMsg}`)
    }
  }

  // ========== 加载孩子列表 ==========
  const loadChildren = async () => {
    if (!userId) return
    try {
      const response = await axios.get(`/api/children/${userId}`)
      if (response.data.success) {
        setChildren(response.data.children || [])
        if (response.data.children.length > 0 && !selectedChild) {
          setSelectedChild(response.data.children[0])
        }
      }
    } catch (error) {
      console.error('加载孩子列表失败:', error)
    }
  }
    // ========== 加载打卡记录 ==========
  const loadCheckins = async (childId: string) => {
    try {
      const response = await axios.get(`/api/checkins/${childId}`)
      if (response.data.success) {
        setCheckins(response.data.checkins || [])
      }
    } catch (error) {
      console.error('加载打卡记录失败:', error)
    }
  }

  // ========== 加载任务列表 ==========
  const loadTasks = async () => {
    if (!userId) return
    try {
      const response = await axios.get(`/api/tasks/${userId}`)
      if (response.data.success) {
        setTasks(response.data.tasks || [])
      }
    } catch (error) {
      console.error('加载任务列表失败:', error)
    }
  }

  // ========== 创建孩子 ==========
  const handleCreateChild = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId || !newChildName.trim()) {
      setMessage('❌ 请输入孩子姓名')
      return
    }

    try {
      const response = await axios.post('/api/children', {
        parentId: userId,
        name: newChildName.trim(),
        petType: newChildPet
      })
      if (response.data.success) {
        setMessage(`✅ ${response.data.message}`)
        setNewChildName('')
        setShowChildForm(false)
        await loadChildren()
      }
    } catch (error: any) {
      setMessage(`❌ ${error.response?.data?.error || '创建失败'}`)
    }
  }

  // ========== 打卡 ==========
  const handleCheckin = async (taskId: string) => {
    if (!selectedChild) {
      setMessage('❌ 请先选择孩子')
      return
    }

    try {
      const response = await axios.post('/api/checkin', {
        childId: selectedChild.id,
        taskId: taskId
      })
      if (response.data.success) {
        const data = response.data.data
        setCheckinResult(data)
        setMessage(`✅ 打卡成功！获得 ${data.pointsEarned} 分`)
        
        // 更新选中的孩子信息
        setSelectedChild({
          ...selectedChild,
          total_score: data.newTotal,
          pet_level: data.newLevel
        })
        // 刷新孩子列表
        await loadChildren()
        // 重新加载打卡记录  <--- 新增这行
        if (selectedChild) {
          await loadCheckins(selectedChild.id)
        }
      }
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || '打卡失败'
      setMessage(`❌ ${errorMsg}`)
    }
  }
  // ========== 撤回打卡 ==========
  const handleUndoCheckin = async (checkinId: string) => {
    if (!confirm('确定要撤回这条打卡记录吗？')) return

    try {
      const response = await axios.delete(`/api/checkin/${checkinId}`)
      if (response.data.success) {
        const data = response.data.data
        setMessage(`↩️ 撤回成功！扣回 ${data.pointsDeducted} 分`)
        
        // 更新选中的孩子信息
        if (selectedChild) {
          setSelectedChild({
            ...selectedChild,
            total_score: data.newTotal,
            pet_level: data.newLevel
          })
        }
        // 重新加载打卡记录
        if (selectedChild) {
          await loadCheckins(selectedChild.id)
        }
        // 刷新孩子列表
        await loadChildren()
      }
    } catch (error: any) {
      setMessage(`❌ ${error.response?.data?.error || '撤回失败'}`)
    }
  }

  // ========== 加载商店奖励 ==========
  const loadRewards = async (childId: string) => {
    if (!userId) return
    try {
      const response = await axios.get(`/api/rewards/${userId}?childId=${childId}`)
      if (response.data.success) {
        setRewards(response.data.rewards || [])
      }
    } catch (error) {
      console.error('加载商店失败:', error)
    }
  }

  // ========== 兑换奖励 ==========
  const handleRedeem = async (rewardId: string, cost: number) => {
    if (!selectedChild) return
    if (!confirm(`确定要花费 ${cost} 积分兑换此奖励吗？`)) return

    try {
      const response = await axios.post('/api/redeem', {
        childId: selectedChild.id,
        rewardId: rewardId
      })
      if (response.data.success) {
        setMessage(`✅ ${response.data.message}`)
        // 更新积分
        setSelectedChild({
          ...selectedChild,
          total_score: response.data.newTotal
        })
        await loadChildren()
        await loadRewards(selectedChild.id)
      }
    } catch (error: any) {
      setMessage(`❌ ${error.response?.data?.error || '兑换失败'}`)
    }
  }

  // ========== 创建奖励（家长端） ==========
  const handleCreateReward = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) return
    if (!newRewardName.trim() || !newRewardCost) {
      setMessage('❌ 请填写奖励名称和积分')
      return
    }
    const cost = parseInt(newRewardCost)
    if (isNaN(cost) || cost <= 0) {
      setMessage('❌ 积分必须是正数')
      return
    }

    try {
      const response = await axios.post('/api/rewards', {
        parentId: userId,
        childId: selectedChild?.id || null,
        name: newRewardName.trim(),
        cost: cost
      })
      if (response.data.success) {
        setMessage(`✅ ${response.data.message}`)
        setNewRewardName('')
        setNewRewardCost('')
        if (selectedChild) {
          await loadRewards(selectedChild.id)
        }
      }
    } catch (error: any) {
      setMessage(`❌ ${error.response?.data?.error || '创建失败'}`)
    }
  }

  
  // ========== 加载兑换记录（家长审批用） ==========
  const loadRedemptions = async () => {
    if (!userId) return
    try {
      const response = await axios.get(`/api/redemptions/${userId}`)
      if (response.data.success) {
        setRedemptions(response.data.redemptions || [])
      }
    } catch (error) {
      console.error('加载兑换记录失败:', error)
    }
  }

  // ========== 审批兑换 ==========
  const handleApproveRedemption = async (redemptionId: string) => {
    if (!confirm('确认批准此兑换？')) return
    try {
      const response = await axios.put(`/api/redemption/${redemptionId}`, { status: 'approved' })
      if (response.data.success) {
        setMessage(`✅ ${response.data.message}`)
        await loadRedemptions()
      }
    } catch (error: any) {
      setMessage(`❌ ${error.response?.data?.error || '操作失败'}`)
    }
  }

  const handleRejectRedemption = async (redemptionId: string) => {
    if (!confirm('确认拒绝此兑换？积分将返还给孩子。')) return
    try {
      const response = await axios.put(`/api/redemption/${redemptionId}`, { status: 'rejected' })
      if (response.data.success) {
        setMessage(`✅ ${response.data.message}`)
        await loadRedemptions()
        // 刷新孩子列表，更新积分
        await loadChildren()
        if (selectedChild) {
          // 重新获取选中的孩子最新信息
          const updatedChild = children.find(c => c.id === selectedChild.id)
          if (updatedChild) setSelectedChild(updatedChild)
        }
      }
    } catch (error: any) {
      setMessage(`❌ ${error.response?.data?.error || '操作失败'}`)
    }
  }
  // ========== 加载热力图数据 ==========
  const loadStats = async (childId: string) => {
    try {
      const response = await axios.get(`/api/checkins/${childId}/stats`)
      if (response.data.success) {
        setHeatmapData(response.data.stats || [])
      }
    } catch (error) {
      console.error('加载统计失败:', error)
    }
  }

  // ========== 切换孩子 ==========
  const selectChild = async(child: Child) => {
    setSelectedChild(child)
    setCheckinResult(null)
    await loadCheckins(child.id)
    await loadRewards(child.id)
    await loadStats(child.id)
  }

  // ========== 登出 ==========
  const handleLogout = () => {
    setUserId(null)
    setSelectedChild(null)
    setChildren([])
    setTasks([])
    localStorage.removeItem('userId')
    localStorage.removeItem('username')
    setMessage('')
    setCheckinResult(null)
  }

  // ========== 加载数据（当 userId 变化时） ==========
  useEffect(() => {
    if (userId) {
      loadChildren()
      loadTasks()
    }
  }, [userId])

  // ========== 自动登录（从 localStorage 恢复） ==========
  useEffect(() => {
    const savedUserId = localStorage.getItem('userId')
    if (savedUserId) {
      setUserId(savedUserId)
    }
  }, [])

  // ========== 宠物等级显示 ==========
  const getLevelLabel = (level: number): string => {
    const labels = ['破壳', '好奇张望', '活泼成长', '自信挺立', '少年英姿', '优雅成熟', '威严高贵', '传奇加冕']
    return labels[level] || '未知'
  }

  const getPetEmoji = (type: string, level: number): string => {
    const pets: Record<string, string[]> = {
      cat: ['🐱', '🐈', '🐈', '🐈', '🐈‍⬛', '🐈‍⬛', '🐅', '🐯'],
      dog: ['🐶', '🐕', '🐕', '🐕‍🦺', '🐩', '🐕‍🦺', '🐕', '🐺'],
      rabbit: ['🐰', '🐇', '🐇', '🐇', '🐰', '🐇', '🐇', '🐇']
    }
    const list = pets[type] || pets.cat
    return list[level] || list[0]
  }

  // ========== 获取等级进度 ==========
  const getProgress = (score: number): number => {
    const thresholds = [0, 40, 100, 180, 280, 400, 540, 700]
    let level = 0
    for (let i = thresholds.length - 1; i >= 0; i--) {
      if (score >= thresholds[i]) { level = i; break }
    }
    const current = thresholds[level]
    const next = thresholds[level + 1] || current + 200
    const progress = (score - current) / (next - current) * 100
    return Math.min(progress, 100)
  }

  // ========== 未登录界面 ==========
  if (!userId) {
    return (
      <div style={{
        background: 'white',
        padding: '40px',
        borderRadius: '16px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
        width: '100%',
        maxWidth: '400px',
      }}>
        <h1 style={{ textAlign: 'center', marginBottom: '24px', color: '#1a1a2e' }}>
          🐾 打卡宠物
        </h1>
        
        <h2 style={{ textAlign: 'center', marginBottom: '24px', fontSize: '18px', color: '#555' }}>
          {isLogin ? '登录' : '注册'}
        </h2>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #ddd',
                borderRadius: '8px',
                fontSize: '16px',
              }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isLogin ? '请输入密码' : '至少6位'}
              required
              minLength={6}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #ddd',
                borderRadius: '8px',
                fontSize: '16px',
              }}
            />
          </div>

          <button
            type="submit"
            style={{
              width: '100%',
              padding: '12px',
              background: '#4F46E5',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            {isLogin ? '登录' : '注册'}
          </button>
        </form>

        {message && (
          <p style={{
            marginTop: '16px',
            textAlign: 'center',
            color: message.includes('✅') ? '#22c55e' : '#ef4444',
            fontSize: '14px',
          }}>
            {message}
          </p>
        )}

        <p style={{ marginTop: '16px', textAlign: 'center', fontSize: '14px', color: '#888' }}>
          {isLogin ? '还没有账号？' : '已有账号？'}
          <button
            onClick={() => setIsLogin(!isLogin)}
            style={{
              background: 'none',
              border: 'none',
              color: '#4F46E5',
              fontWeight: '600',
              cursor: 'pointer',
              marginLeft: '4px',
            }}
          >
            {isLogin ? '去注册' : '去登录'}
          </button>
        </p>
      </div>
    )
  }

  // ========== 已登录主界面 ==========
  return (
    <div style={{
      background: 'white',
      padding: '30px',
      borderRadius: '16px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
      width: '100%',
      maxWidth: '600px',
      maxHeight: '90vh',
      overflowY: 'auto',
    }}>
      {/* 顶部：用户名 + 登出 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ color: '#1a1a2e' }}>🐾 打卡宠物</h2>
        <div>
          <span style={{ marginRight: '12px', color: '#555' }}>{localStorage.getItem('username')}</span>
          <button
            onClick={handleLogout}
            style={{
              background: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              padding: '4px 12px',
              cursor: 'pointer',
            }}
          >
            登出
          </button>
        </div>
      </div>

      {/* 孩子选择区 */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontWeight: '600' }}>👶 选择孩子</span>
          <button
            onClick={() => setShowChildForm(!showChildForm)}
            style={{
              background: '#4F46E5',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              padding: '4px 12px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            + 添加孩子
          </button>
        </div>

        {/* 创建孩子表单 */}
        {showChildForm && (
          <form onSubmit={handleCreateChild} style={{
            background: '#f8f9fa',
            padding: '12px',
            borderRadius: '8px',
            marginBottom: '12px',
          }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input
                type="text"
                value={newChildName}
                onChange={(e) => setNewChildName(e.target.value)}
                placeholder="孩子姓名"
                style={{
                  flex: '1',
                  padding: '6px 10px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  minWidth: '100px',
                }}
              />
              <select
                value={newChildPet}
                onChange={(e) => setNewChildPet(e.target.value)}
                style={{
                  padding: '6px 10px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                }}
              >
                <option value="cat">🐱 猫</option>
                <option value="dog">🐶 狗</option>
                <option value="rabbit">🐰 兔</option>
              </select>
              <button
                type="submit"
                style={{
                  background: '#22c55e',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 16px',
                  cursor: 'pointer',
                }}
              >
                创建
              </button>
              <button
                type="button"
                onClick={() => setShowChildForm(false)}
                style={{
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  cursor: 'pointer',
                }}
              >
                取消
              </button>
            </div>
          </form>
        )}

        {/* 孩子列表 */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {children.map((child) => (
            <button
              key={child.id}
              onClick={() => selectChild(child)}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                border: selectedChild?.id === child.id ? '2px solid #4F46E5' : '1px solid #ddd',
                background: selectedChild?.id === child.id ? '#eef2ff' : 'white',
                cursor: 'pointer',
              }}
            >
              {getPetEmoji(child.pet_type, child.pet_level)} {child.name}
              <span style={{ fontSize: '12px', color: '#888', marginLeft: '4px' }}>
                ({child.total_score}分)
              </span>
            </button>
          ))}
          {children.length === 0 && (
            <span style={{ color: '#888', fontSize: '14px' }}>还没有孩子，点击"添加孩子"创建</span>
          )}
        </div>
      </div>

      {/* 选中的孩子详情 */}
      {selectedChild && (
        <div style={{
          background: '#f0f4ff',
          padding: '16px',
          borderRadius: '12px',
          marginBottom: '16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ fontSize: '48px' }}>
              {getPetEmoji(selectedChild.pet_type, selectedChild.pet_level)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: '600', fontSize: '18px' }}>{selectedChild.name}</span>
                <span style={{ color: '#4F46E5', fontWeight: '600' }}>
                  {getLevelLabel(selectedChild.pet_level)}
                </span>
              </div>
              <div style={{ fontSize: '14px', color: '#555' }}>
                积分: {selectedChild.total_score} 分
              </div>
              <div style={{
                width: '100%',
                background: '#ddd',
                borderRadius: '10px',
                height: '8px',
                marginTop: '4px',
              }}>
                <div style={{
                  width: `${getProgress(selectedChild.total_score)}%`,
                  background: '#4F46E5',
                  borderRadius: '10px',
                  height: '8px',
                  transition: 'width 0.5s',
                }} />
              </div>
            </div>
          </div>

          {/* 打卡结果通知 */}
          {checkinResult && (
            <div style={{
              marginTop: '12px',
              padding: '10px',
              borderRadius: '8px',
              background: checkinResult.leveledUp ? '#fef3c7' : '#d1fae5',
              border: checkinResult.leveledUp ? '1px solid #f59e0b' : '1px solid #34d399',
            }}>
              {checkinResult.leveledUp ? (
                <span style={{ fontWeight: '600', color: '#d97706' }}>
                  🎉 升级啦！{getLevelLabel(checkinResult.newLevel)}
                </span>
              ) : (
                <span style={{ color: '#065f46' }}>
                  +{checkinResult.pointsEarned} 分 ({checkinResult.oldTotal} → {checkinResult.newTotal})
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* 任务列表 */}
      {selectedChild && tasks.length > 0 && (
        <div>
          <h3 style={{ marginBottom: '12px', fontSize: '16px' }}>📋 今日任务</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {tasks.filter(t => t.is_active).map((task) => (
              <div
                key={task.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 14px',
                  background: '#f8f9fa',
                  borderRadius: '8px',
                  border: '1px solid #eee',
                }}
              >
                <div>
                  <span style={{ fontWeight: '500' }}>{task.name}</span>
                  <span style={{ fontSize: '12px', color: '#888', marginLeft: '8px' }}>
                    {task.category} · {task.points}分
                  </span>
                  <span style={{ fontSize: '11px', color: '#aaa', marginLeft: '8px' }}>
                    每日上限 {task.daily_limit}次
                  </span>
                </div>
                <button
                  onClick={() => handleCheckin(task.id)}
                  style={{
                    background: '#4F46E5',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '4px 14px',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                >
                  ✅ 打卡
                </button>
              </div>
            ))}
            {tasks.filter(t => t.is_active).length === 0 && (
              <p style={{ color: '#888', fontSize: '14px' }}>暂无任务，请在 Supabase 中手动添加</p>
            )}
          </div>
        </div>
      )}

      {/* 打卡记录 */}
      {selectedChild && (
        <div style={{ marginTop: '16px' }}>
          <button
            onClick={() => setShowCheckins(!showCheckins)}
            style={{
              background: 'none',
              border: 'none',
              color: '#4F46E5',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            📋 {showCheckins ? '收起打卡记录' : '查看打卡记录'}
          </button>
          
          {showCheckins && (
            <div style={{ marginTop: '8px' }}>
              {checkins.length === 0 ? (
                <p style={{ color: '#888', fontSize: '14px' }}>暂无打卡记录</p>
              ) : (
                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {checkins.slice(0, 20).map((record) => (
                    <div
                      key={record.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '6px 10px',
                        borderBottom: '1px solid #f0f0f0',
                        fontSize: '14px',
                      }}
                    >
                      <span>
                        {record.tasks?.name || '未知任务'}
                        <span style={{ color: '#4F46E5', marginLeft: '8px' }}>
                          +{record.points_earned}分
                        </span>
                        <span style={{ color: '#aaa', marginLeft: '8px', fontSize: '12px' }}>
                          {new Date(record.created_at).toLocaleDateString()}
                        </span>
                      </span>
                      <button
                        onClick={() => handleUndoCheckin(record.id)}
                        style={{
                          background: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '2px 10px',
                          cursor: 'pointer',
                          fontSize: '12px',
                        }}
                      >
                        撤回
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 热力图统计 */}
      {selectedChild && (
        <div style={{ marginTop: '16px', borderTop: '1px solid #eee', paddingTop: '16px' }}>
          <button
            onClick={() => {
              const newState = !showStats
              setShowStats(newState)
              if (newState && selectedChild) {
                loadStats(selectedChild.id)
              }
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#8b5cf6',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            📊 {showStats ? '收起热力图' : '查看打卡热力图'}
          </button>

          {showStats && (
            <div style={{ marginTop: '12px', padding: '8px' }}>
              {heatmapData.length === 0 ? (
                <p style={{ color: '#888', fontSize: '14px', textAlign: 'center' }}>
                  暂无打卡数据，快去打卡吧！🎯
                </p>
              ) : (
                <>
                  <HeatMap
                    startDate={new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)}
                    endDate={new Date()}
                    values={heatmapData}
                    classForValue={(value: any) => {
                      if (!value || value.count === 0) return 'color-empty'
                      if (value.count <= 2) return 'color-scale-1'
                      if (value.count <= 4) return 'color-scale-2'
                      if (value.count <= 6) return 'color-scale-3'
                      return 'color-scale-4'
                    }}
                    gutterSize={4}
                  />
                  <style>{`
                    .react-calendar-heatmap .color-empty { fill: #ebedf0; }
                    .react-calendar-heatmap .color-scale-1 { fill: #9be9a8; }
                    .react-calendar-heatmap .color-scale-2 { fill: #40c463; }
                    .react-calendar-heatmap .color-scale-3 { fill: #30a14e; }
                    .react-calendar-heatmap .color-scale-4 { fill: #216e39; }
                    .react-calendar-heatmap rect:hover { stroke: #555; stroke-width: 1px; }
                  `}</style>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'flex-end', 
                    gap: '4px', 
                    marginTop: '4px',
                    fontSize: '12px',
                    color: '#888',
                    alignItems: 'center'
                  }}>
                    <span>少</span>
                    <svg width="12" height="12"><rect width="12" height="12" fill="#ebedf0" rx="2"/></svg>
                    <svg width="12" height="12"><rect width="12" height="12" fill="#9be9a8" rx="2"/></svg>
                    <svg width="12" height="12"><rect width="12" height="12" fill="#40c463" rx="2"/></svg>
                    <svg width="12" height="12"><rect width="12" height="12" fill="#30a14e" rx="2"/></svg>
                    <svg width="12" height="12"><rect width="12" height="12" fill="#216e39" rx="2"/></svg>
                    <span>多</span>
                  </div>
                  <p style={{ 
                    fontSize: '12px', 
                    color: '#aaa', 
                    textAlign: 'center', 
                    marginTop: '4px' 
                  }}>
                    最近365天打卡记录 · 总共 {heatmapData.reduce((sum, d) => sum + d.count, 0)} 次
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* 商店 */}
      {selectedChild && (
        <div style={{ marginTop: '16px', borderTop: '1px solid #eee', paddingTop: '16px' }}>
          <button
            onClick={() => {
              const newState = !showShop
              setShowShop(newState)
              if (newState && selectedChild) {
                loadRewards(selectedChild.id)
              }
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#4F46E5',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            🎁 {showShop ? '收起商店' : '查看商店'}
          </button>

          {showShop && (
            <div>
              {/* 添加奖励表单 */}
              <form onSubmit={handleCreateReward} style={{
                background: '#f8f9fa',
                padding: '12px',
                borderRadius: '8px',
                marginTop: '8px',
                display: 'flex',
                gap: '8px',
                flexWrap: 'wrap',
                alignItems: 'center'
              }}>
                <input
                  type="text"
                  value={newRewardName}
                  onChange={(e) => setNewRewardName(e.target.value)}
                  placeholder="奖励名称（如：看电视）"
                  style={{
                    flex: '1',
                    padding: '6px 10px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    minWidth: '120px'
                  }}
                />
                <input
                  type="number"
                  value={newRewardCost}
                  onChange={(e) => setNewRewardCost(e.target.value)}
                  placeholder="积分"
                  style={{
                    width: '80px',
                    padding: '6px 10px',
                    border: '1px solid #ddd',
                    borderRadius: '6px'
                  }}
                />
                <button
                  type="submit"
                  style={{
                    background: '#8b5cf6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 16px',
                    cursor: 'pointer'
                  }}
                >
                  + 添加奖励
                </button>
              </form>

              {/* 奖励列表 */}
              {rewards.length === 0 ? (
                <p style={{ color: '#888', fontSize: '14px', marginTop: '8px' }}>暂无商店奖励</p>
              ) : (
                <div style={{ marginTop: '8px' }}>
                  {rewards.map((reward) => (
                    <div
                      key={reward.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '8px 12px',
                        borderBottom: '1px solid #f0f0f0'
                      }}
                    >
                      <span>
                        {reward.name}
                        <span style={{ color: '#f59e0b', marginLeft: '8px' }}>
                          🪙 {reward.cost}分
                        </span>
                      </span>
                      <button
                        onClick={() => handleRedeem(reward.id, reward.cost)}
                        disabled={selectedChild.total_score < reward.cost}
                        style={{
                          background: selectedChild.total_score >= reward.cost ? '#4F46E5' : '#ccc',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '4px 14px',
                          cursor: selectedChild.total_score >= reward.cost ? 'pointer' : 'not-allowed',
                          fontSize: '13px'
                        }}
                      >
                        兑换
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {/* 待审批兑换 */}
      <div style={{ marginTop: '16px', borderTop: '1px solid #ddd', paddingTop: '12px' }}>
        <button
          onClick={() => {
            const newState = !showRedemptions
            setShowRedemptions(newState)
            if (newState) {
              loadRedemptions()
            }
          }}
          style={{
            background: 'none',
            border: 'none',
            color: '#f59e0b',
            fontWeight: '600',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          📋 {showRedemptions ? '收起待审批' : `待审批兑换 (${redemptions.filter(r => r.status === 'pending').length})`}
        </button>

        {showRedemptions && (
          <div style={{ marginTop: '8px' }}>
            {redemptions.filter(r => r.status === 'pending').length === 0 ? (
              <p style={{ color: '#888', fontSize: '14px' }}>🎉 暂无待审批的兑换</p>
            ) : (
              redemptions.filter(r => r.status === 'pending').map((record) => (
                <div
                  key={record.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    background: '#fffbeb',
                    borderRadius: '8px',
                    marginBottom: '6px',
                    border: '1px solid #fde68a'
                  }}
                >
                  <div>
                    <span style={{ fontWeight: '500' }}>
                      {record.children?.name || '未知孩子'}
                    </span>
                    <span style={{ marginLeft: '8px' }}>
                      🎁 {record.rewards?.name || '未知奖励'}
                    </span>
                    <span style={{ color: '#f59e0b', marginLeft: '8px' }}>
                      🪙 {record.cost}分
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => handleApproveRedemption(record.id)}
                      style={{
                        background: '#22c55e',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '4px 12px',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      ✅ 批准
                    </button>
                    <button
                      onClick={() => handleRejectRedemption(record.id)}
                      style={{
                        background: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '4px 12px',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      ❌ 拒绝
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
      {/* 消息通知 */}
      {message && (
        <p style={{
          marginTop: '12px',
          padding: '8px 12px',
          borderRadius: '6px',
          background: message.includes('✅') ? '#d1fae5' : '#fee2e2',
          color: message.includes('✅') ? '#065f46' : '#991b1b',
          fontSize: '14px',
        }}>
          {message}
        </p>
      )}
    </div>
  )
}

export default App