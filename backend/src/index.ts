import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import crypto from 'crypto'

// 加载 .env 文件中的环境变量
dotenv.config()

// 从环境变量获取 Supabase 连接信息
const supabaseUrl = process.env.SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY

// 检查环境变量是否存在
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('错误: 请在 .env 文件中设置 SUPABASE_URL 和 SUPABASE_ANON_KEY')
  process.exit(1)
}

// 创建 Supabase 客户端
const supabase = createClient(supabaseUrl, supabaseAnonKey)

const app = new Hono()

// ========== 测试路由 ==========
app.get('/', async (c) => {
  try {
    const { error } = await supabase.from('users').select('count').limit(0)
    if (error) {
      return c.text('数据库连接失败: ' + error.message)
    }
    return c.text('✅ 后端运行正常！数据库连接成功！')
  } catch (e) {
    return c.text('❌ 连接数据库出错: ' + String(e))
  }
})

// ========== 用户注册接口 ==========
app.post('/api/register', async (c) => {
  try {
    const body = await c.req.json()
    const { username, password } = body

    // 1. 验证用户名和密码是否提供
    if (!username || !password) {
      return c.json({ error: '用户名和密码不能为空' }, 400)
    }

    // 2. 验证密码长度（至少6位）
    if (password.length < 6) {
      return c.json({ error: '密码至少6位' }, 400)
    }

    // 3. 检查用户名是否已存在
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('username')
      .eq('username', username)
      .maybeSingle()

    if (checkError) {
      return c.json({ error: '查询用户失败: ' + checkError.message }, 500)
    }

    if (existingUser) {
      return c.json({ error: '用户名已存在' }, 400)
    }

    // 4. 生成随机 salt（16字节，转base64）
    const salt = crypto.randomBytes(16).toString('base64')

    // 5. 使用 PBKDF2-SHA256 加密密码（10万次迭代）
    const encoder = new TextEncoder()
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    )
    const hashBuffer = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: encoder.encode(salt),
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      256 // 输出 256 位（32字节）
    )
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const passwordHash = btoa(String.fromCharCode(...hashArray))

    // 6. 插入用户数据到数据库
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({
        username: username,
        password_hash: passwordHash,
        salt: salt,
        iterations: 100000,
        role: 'parent'
      })
      .select('id, username, role, created_at')
      .single()

    if (insertError) {
      return c.json({ error: '注册失败: ' + insertError.message }, 500)
    }

    // 7. 返回成功信息（不返回密码相关字段）
    return c.json({
      success: true,
      message: '注册成功！',
      user: {
        id: newUser.id,
        username: newUser.username,
        role: newUser.role,
        created_at: newUser.created_at
      }
    }, 201)

  } catch (error) {
    console.error('注册错误:', error)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

// ========== 用户登录接口 ==========
app.post('/api/login', async (c) => {
  try {
    const body = await c.req.json()
    const { username, password } = body

    // 1. 验证用户名和密码是否提供
    if (!username || !password) {
      return c.json({ error: '用户名和密码不能为空' }, 400)
    }

    // 2. 从数据库查询用户
    const { data: user, error: queryError } = await supabase
      .from('users')
      .select('id, username, password_hash, salt, iterations, role')
      .eq('username', username)
      .maybeSingle()

    if (queryError) {
      return c.json({ error: '查询用户失败: ' + queryError.message }, 500)
    }

    if (!user) {
      return c.json({ error: '用户名或密码错误' }, 401)
    }

    // 3. 使用 PBKDF2-SHA256 验证密码
    const encoder = new TextEncoder()
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    )
    const hashBuffer = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: encoder.encode(user.salt),
        iterations: user.iterations,
        hash: 'SHA-256'
      },
      keyMaterial,
      256
    )
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const passwordHash = btoa(String.fromCharCode(...hashArray))

    // 4. 比对密码哈希
    if (passwordHash !== user.password_hash) {
      return c.json({ error: '用户名或密码错误' }, 401)
    }

    // 5. 登录成功，返回用户信息（不返回密码相关字段）
    return c.json({
      success: true,
      message: '登录成功！',
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    }, 200)

  } catch (error) {
    console.error('登录错误:', error)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

// ========== 创建孩子档案接口 ==========
app.post('/api/children', async (c) => {
  try {
    const body = await c.req.json()
    const { parentId, name, petType } = body

    // 1. 验证必填字段
    if (!parentId || !name) {
      return c.json({ error: '家长ID和孩子姓名不能为空' }, 400)
    }

    // 2. 验证家长是否存在
    const { data: parent, error: parentError } = await supabase
      .from('users')
      .select('id')
      .eq('id', parentId)
      .maybeSingle()

    if (parentError || !parent) {
      return c.json({ error: '家长不存在，请先注册' }, 404)
    }

    // 3. 插入孩子档案
    const { data: newChild, error: insertError } = await supabase
      .from('children')
      .insert({
        parent_id: parentId,
        name: name,
        pet_type: petType || 'cat',  // 默认为猫
        total_score: 0,
        pet_level: 0
      })
      .select('id, name, pet_type, total_score, pet_level, created_at')
      .single()

    if (insertError) {
      return c.json({ error: '创建孩子档案失败: ' + insertError.message }, 500)
    }

    // 4. 返回成功结果
    return c.json({
      success: true,
      message: '孩子档案创建成功！',
      child: newChild
    }, 201)

  } catch (error) {
    console.error('创建孩子档案错误:', error)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

// ========== 创建任务接口 ==========
app.post('/api/tasks', async (c) => {
  try {
    const body = await c.req.json()
    const { parentId, name, category, points, dailyLimit } = body

    // 1. 验证必填字段
    if (!parentId || !name || !category || !points) {
      return c.json({ error: '家长ID、任务名称、分类和分值不能为空' }, 400)
    }

    // 2. 验证分值必须大于0
    if (points <= 0) {
      return c.json({ error: '分值必须大于0' }, 400)
    }

    // 3. 验证家长是否存在
    const { data: parent, error: parentError } = await supabase
      .from('users')
      .select('id')
      .eq('id', parentId)
      .maybeSingle()

    if (parentError || !parent) {
      return c.json({ error: '家长不存在' }, 404)
    }

    // 4. 插入任务
    const { data: newTask, error: insertError } = await supabase
      .from('tasks')
      .insert({
        parent_id: parentId,
        name: name,
        category: category,
        points: points,
        daily_limit: dailyLimit || 1,
        is_active: true
      })
      .select('id, name, category, points, daily_limit, is_active, created_at')
      .single()

    if (insertError) {
      return c.json({ error: '创建任务失败: ' + insertError.message }, 500)
    }

    return c.json({
      success: true,
      message: '任务创建成功！',
      task: newTask
    }, 201)

  } catch (error) {
    console.error('创建任务错误:', error)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

// ========== 获取任务列表接口 ==========
app.get('/api/tasks/:parentId', async (c) => {
  try {
    const parentId = c.req.param('parentId')

    if (!parentId) {
      return c.json({ error: '家长ID不能为空' }, 400)
    }

    const { data: tasks, error: queryError } = await supabase
      .from('tasks')
      .select('*')
      .eq('parent_id', parentId)
      .order('created_at', { ascending: false })

    if (queryError) {
      return c.json({ error: '查询任务失败: ' + queryError.message }, 500)
    }

    return c.json({
      success: true,
      tasks: tasks || []
    }, 200)

  } catch (error) {
    console.error('获取任务列表错误:', error)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

// ========== 打卡接口 ==========
app.post('/api/checkin', async (c) => {
  try {
    const body = await c.req.json()
    const { childId, taskId } = body

    // 1. 验证必填字段
    if (!childId || !taskId) {
      return c.json({ error: '孩子ID和任务ID不能为空' }, 400)
    }

    // 2. 查询任务信息
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('id, points, daily_limit, is_active')
      .eq('id', taskId)
      .maybeSingle()

    if (taskError || !task) {
      return c.json({ error: '任务不存在' }, 404)
    }

    if (!task.is_active) {
      return c.json({ error: '该任务已停用' }, 400)
    }

    // 3. 查询孩子信息（当前积分）
    const { data: child, error: childError } = await supabase
      .from('children')
      .select('id, total_score, pet_level')
      .eq('id', childId)
      .maybeSingle()

    if (childError || !child) {
      return c.json({ error: '孩子档案不存在' }, 404)
    }

    // 4. 检查今日是否已打卡（使用PostgreSQL的日期函数）
    const today = new Date().toISOString().split('T')[0]
    const { data: todayCheckins, error: checkError } = await supabase
      .from('checkins')
      .select('id')
      .eq('child_id', childId)
      .eq('task_id', taskId)
      .gte('created_at', `${today}T00:00:00Z`)
      .lt('created_at', `${today}T23:59:59Z`)

    if (checkError) {
      return c.json({ error: '查询打卡记录失败: ' + checkError.message }, 500)
    }

    if (todayCheckins && todayCheckins.length >= task.daily_limit) {
      return c.json({ error: `今日已打卡${todayCheckins.length}次，已达上限` }, 400)
    }

    // 5. 计算新积分
    const oldTotal = child.total_score
    const newTotal = oldTotal + task.points

    // 6. 计算新等级（阈值：0, 40, 100, 180, 280, 400, 540, 700）
    const thresholds = [0, 40, 100, 180, 280, 400, 540, 700]
    let newLevel = 0
    for (let i = thresholds.length - 1; i >= 0; i--) {
      if (newTotal >= thresholds[i]) {
        newLevel = i
        break
      }
    }

    // 7. 更新孩子的积分和等级
    const { error: updateError } = await supabase
      .from('children')
      .update({
        total_score: newTotal,
        pet_level: newLevel
      })
      .eq('id', childId)

    if (updateError) {
      return c.json({ error: '更新积分失败: ' + updateError.message }, 500)
    }

    // 8. 记录打卡历史（含快照）
    const { error: insertError } = await supabase
      .from('checkins')
      .insert({
        child_id: childId,
        task_id: taskId,
        checkin_date: today,
        points_earned: task.points,
        score_before: oldTotal,
        score_after: newTotal
      })

    if (insertError) {
      // 如果记录打卡失败，需要回滚积分更新（这里简化处理，实际应该用事务）
      console.error('记录打卡失败:', insertError)
      return c.json({ error: '记录打卡失败: ' + insertError.message }, 500)
    }

    // 9. 返回结果
    return c.json({
      success: true,
      message: '打卡成功！',
      data: {
        pointsEarned: task.points,
        oldTotal: oldTotal,
        newTotal: newTotal,
        oldLevel: child.pet_level,
        newLevel: newLevel,
        leveledUp: newLevel > child.pet_level
      }
    }, 200)

  } catch (error) {
    console.error('打卡错误:', error)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

// ========== 获取打卡记录接口 ==========
app.get('/api/checkins/:childId', async (c) => {
  try {
    const childId = c.req.param('childId')

    if (!childId) {
      return c.json({ error: '孩子ID不能为空' }, 400)
    }

    const { data: checkins, error: queryError } = await supabase
      .from('checkins')
      .select(`
        *,
        tasks (
          name,
          category,
          points
        )
      `)
      .eq('child_id', childId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (queryError) {
      return c.json({ error: '查询打卡记录失败: ' + queryError.message }, 500)
    }

    return c.json({
      success: true,
      checkins: checkins || []
    }, 200)

  } catch (error) {
    console.error('获取打卡记录错误:', error)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

// ========== 获取打卡统计（热力图数据） ==========
app.get('/api/checkins/:childId/stats', async (c) => {
  try {
    const childId = c.req.param('childId')

    if (!childId) {
      return c.json({ error: '孩子ID不能为空' }, 400)
    }

    // 获取最近365天的打卡统计数据（按天分组）
    const { data: stats, error: queryError } = await supabase
      .from('checkins')
      .select('checkin_date, count')
      .eq('child_id', childId)
      .gte('checkin_date', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .select('checkin_date')
      .then(async (result) => {
        // 手动分组统计（Supabase 的 count 需要配合 group by，这里用简单的 JS 聚合）
        if (result.error) throw result.error
        const map: Record<string, number> = {}
        result.data.forEach((row: any) => {
          const date = row.checkin_date
          map[date] = (map[date] || 0) + 1
        })
        return { data: Object.entries(map).map(([date, count]) => ({ date, count })), error: null }
      })

    // 但由于 Supabase 的链式调用限制，我们采用更可靠的方式：直接查询所有记录，在内存中聚合
    // 或者使用 Supabase 的 rpc 函数，但为了简单，我们直接查询原始记录
    
    // 简化版本：查询最近365天的打卡记录，在内存中聚合
    const oneYearAgo = new Date()
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
    const startDate = oneYearAgo.toISOString().split('T')[0]

    const { data: checkins, error: fetchError } = await supabase
      .from('checkins')
      .select('checkin_date')
      .eq('child_id', childId)
      .gte('checkin_date', startDate)
      .order('checkin_date', { ascending: true })

    if (fetchError) {
      return c.json({ error: '查询统计数据失败: ' + fetchError.message }, 500)
    }

    // 按日期分组计数
    const dateMap: Record<string, number> = {}
    checkins.forEach((row: any) => {
      const date = row.checkin_date
      dateMap[date] = (dateMap[date] || 0) + 1
    })

    const statsData = Object.entries(dateMap).map(([date, count]) => ({
      date: date,
      count: count
    }))

    return c.json({
      success: true,
      stats: statsData
    }, 200)

  } catch (error) {
    console.error('获取统计错误:', error)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

// ========== 获取孩子列表接口 ==========
app.get('/api/children/:parentId', async (c) => {
  try {
    const parentId = c.req.param('parentId')

    if (!parentId) {
      return c.json({ error: '家长ID不能为空' }, 400)
    }

    const { data: children, error: queryError } = await supabase
      .from('children')
      .select('*')
      .eq('parent_id', parentId)
      .order('created_at', { ascending: true })

    if (queryError) {
      return c.json({ error: '查询孩子列表失败: ' + queryError.message }, 500)
    }

    return c.json({
      success: true,
      children: children || []
    }, 200)

  } catch (error) {
    console.error('获取孩子列表错误:', error)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

// ========== 撤回打卡接口 ==========
app.delete('/api/checkin/:checkinId', async (c) => {
  try {
    const checkinId = c.req.param('checkinId')

    if (!checkinId) {
      return c.json({ error: '打卡记录ID不能为空' }, 400)
    }

    // 1. 查询打卡记录
    const { data: checkin, error: queryError } = await supabase
      .from('checkins')
      .select('*')
      .eq('id', checkinId)
      .maybeSingle()

    if (queryError || !checkin) {
      return c.json({ error: '打卡记录不存在' }, 404)
    }

    // 2. 获取孩子当前信息
    const { data: child, error: childError } = await supabase
      .from('children')
      .select('id, total_score, pet_level')
      .eq('id', checkin.child_id)
      .maybeSingle()

    if (childError || !child) {
      return c.json({ error: '孩子档案不存在' }, 404)
    }

    // 3. 扣回积分（但不能低于0）
    const newTotal = Math.max(0, child.total_score - checkin.points_earned)

    // 4. 重新计算等级
    const thresholds = [0, 40, 100, 180, 280, 400, 540, 700]
    let newLevel = 0
    for (let i = thresholds.length - 1; i >= 0; i--) {
      if (newTotal >= thresholds[i]) {
        newLevel = i
        break
      }
    }

    // 5. 更新孩子积分和等级
    const { error: updateError } = await supabase
      .from('children')
      .update({
        total_score: newTotal,
        pet_level: newLevel
      })
      .eq('id', child.id)

    if (updateError) {
      return c.json({ error: '更新积分失败: ' + updateError.message }, 500)
    }

    // 6. 删除打卡记录
    const { error: deleteError } = await supabase
      .from('checkins')
      .delete()
      .eq('id', checkinId)

    if (deleteError) {
      return c.json({ error: '删除打卡记录失败: ' + deleteError.message }, 500)
    }

    // 7. 返回结果
    return c.json({
      success: true,
      message: '撤回成功！',
      data: {
        pointsDeducted: checkin.points_earned,
        oldTotal: child.total_score,
        newTotal: newTotal,
        oldLevel: child.pet_level,
        newLevel: newLevel
      }
    }, 200)

  } catch (error) {
    console.error('撤回打卡错误:', error)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

// ========== 1. 创建奖励商品 ==========
app.post('/api/rewards', async (c) => {
  try {
    const body = await c.req.json()
    const { parentId, childId, name, cost } = body

    if (!parentId || !name || !cost) {
      return c.json({ error: '家长ID、奖励名称和积分价格不能为空' }, 400)
    }

    if (cost <= 0) {
      return c.json({ error: '积分价格必须大于0' }, 400)
    }

    const { data: reward, error: insertError } = await supabase
      .from('rewards')
      .insert({
        parent_id: parentId,
        child_id: childId || null,
        name: name,
        cost: cost,
        is_available: true
      })
      .select('*')
      .single()

    if (insertError) {
      return c.json({ error: '创建奖励失败: ' + insertError.message }, 500)
    }

    return c.json({
      success: true,
      message: '奖励创建成功！',
      reward: reward
    }, 201)

  } catch (error) {
    console.error('创建奖励错误:', error)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

// ========== 2. 获取奖励列表（按家长ID，可指定孩子） ==========
app.get('/api/rewards/:parentId', async (c) => {
  try {
    const parentId = c.req.param('parentId')
    const childId = c.req.query('childId')

    if (!parentId) {
      return c.json({ error: '家长ID不能为空' }, 400)
    }

    let query = supabase
      .from('rewards')
      .select('*')
      .eq('parent_id', parentId)
      .eq('is_available', true)
      .order('created_at', { ascending: false })

    // 如果指定了孩子ID，只显示该孩子专属的 + 通用的（child_id为null）
    if (childId) {
      query = query.or(`child_id.eq.${childId},child_id.is.null`)
    }

    const { data: rewards, error: queryError } = await query

    if (queryError) {
      return c.json({ error: '查询奖励失败: ' + queryError.message }, 500)
    }

    return c.json({
      success: true,
      rewards: rewards || []
    }, 200)

  } catch (error) {
    console.error('获取奖励列表错误:', error)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

// ========== 3. 兑换奖励 ==========
app.post('/api/redeem', async (c) => {
  try {
    const body = await c.req.json()
    const { childId, rewardId } = body

    if (!childId || !rewardId) {
      return c.json({ error: '孩子ID和奖励ID不能为空' }, 400)
    }

    // 1. 查询奖励信息
    const { data: reward, error: rewardError } = await supabase
      .from('rewards')
      .select('*')
      .eq('id', rewardId)
      .eq('is_available', true)
      .maybeSingle()

    if (rewardError || !reward) {
      return c.json({ error: '奖励不存在或已下架' }, 404)
    }

    // 2. 查询孩子当前积分
    const { data: child, error: childError } = await supabase
      .from('children')
      .select('id, total_score, pet_level, name')
      .eq('id', childId)
      .maybeSingle()

    if (childError || !child) {
      return c.json({ error: '孩子档案不存在' }, 404)
    }

    // 3. 检查积分是否足够
    if (child.total_score < reward.cost) {
      return c.json({ error: `积分不足！需要 ${reward.cost} 分，当前只有 ${child.total_score} 分` }, 400)
    }

    const scoreBefore = child.total_score
    const scoreAfter = scoreBefore - reward.cost

    // 4. 扣除积分
    const { error: updateError } = await supabase
      .from('children')
      .update({ total_score: scoreAfter })
      .eq('id', childId)

    if (updateError) {
      return c.json({ error: '扣减积分失败: ' + updateError.message }, 500)
    }

    // 5. 创建兑换记录（状态为 pending）
    const { data: redemption, error: insertError } = await supabase
      .from('redemptions')
      .insert({
        child_id: childId,
        reward_id: rewardId,
        cost: reward.cost,
        status: 'pending',
        score_before: scoreBefore,
        score_after: scoreAfter
      })
      .select('*')
      .single()

    if (insertError) {
      // 兑换记录创建失败，回滚积分（手动加回来）
      await supabase
        .from('children')
        .update({ total_score: scoreBefore })
        .eq('id', childId)
      return c.json({ error: '创建兑换记录失败: ' + insertError.message }, 500)
    }

    return c.json({
      success: true,
      message: `兑换成功！已扣除 ${reward.cost} 积分，等待家长审批`,
      redemption: redemption,
      newTotal: scoreAfter
    }, 200)

  } catch (error) {
    console.error('兑换错误:', error)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

// ========== 4. 获取兑换记录（家长查看，按孩子过滤） ==========
app.get('/api/redemptions/:parentId', async (c) => {
  try {
    const parentId = c.req.param('parentId')
    const childId = c.req.query('childId')

    if (!parentId) {
      return c.json({ error: '家长ID不能为空' }, 400)
    }

    // 查询该家长名下所有孩子的兑换记录
    let query = supabase
      .from('redemptions')
      .select(`
        *,
        children!inner (
          id,
          name,
          parent_id
        ),
        rewards (
          id,
          name,
          cost
        )
      `)
      .eq('children.parent_id', parentId)
      .order('created_at', { ascending: false })

    if (childId) {
      query = query.eq('child_id', childId)
    }

    const { data: redemptions, error: queryError } = await query

    if (queryError) {
      return c.json({ error: '查询兑换记录失败: ' + queryError.message }, 500)
    }

    return c.json({
      success: true,
      redemptions: redemptions || []
    }, 200)

  } catch (error) {
    console.error('获取兑换记录错误:', error)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

// ========== 5. 审批兑换（批准/拒绝） ==========
app.put('/api/redemption/:id', async (c) => {
  try {
    const redemptionId = c.req.param('id')
    const body = await c.req.json()
    const { status } = body // 'approved' 或 'rejected'

    if (!redemptionId || !status) {
      return c.json({ error: '兑换记录ID和审批状态不能为空' }, 400)
    }

    if (!['approved', 'rejected'].includes(status)) {
      return c.json({ error: '审批状态必须是 approved 或 rejected' }, 400)
    }

    // 1. 查询兑换记录
    const { data: redemption, error: queryError } = await supabase
      .from('redemptions')
      .select('*')
      .eq('id', redemptionId)
      .maybeSingle()

    if (queryError || !redemption) {
      return c.json({ error: '兑换记录不存在' }, 404)
    }

    if (redemption.status !== 'pending') {
      return c.json({ error: `该记录已${redemption.status === 'approved' ? '批准' : '拒绝'}，不能重复操作` }, 400)
    }

    // 2. 如果是拒绝，需要返还积分
    if (status === 'rejected') {
      const { data: child, error: childError } = await supabase
        .from('children')
        .select('total_score')
        .eq('id', redemption.child_id)
        .maybeSingle()

      if (childError || !child) {
        return c.json({ error: '孩子档案不存在' }, 404)
      }

      // 返还积分
      const newTotal = child.total_score + redemption.cost
      await supabase
        .from('children')
        .update({ total_score: newTotal })
        .eq('id', redemption.child_id)
    }

    // 3. 更新兑换记录状态
    const updateData: any = {
      status: status
    }
    if (status === 'approved') {
      updateData.approved_at = new Date().toISOString()
    }

    const { error: updateError } = await supabase
      .from('redemptions')
      .update(updateData)
      .eq('id', redemptionId)

    if (updateError) {
      return c.json({ error: '更新审批状态失败: ' + updateError.message }, 500)
    }

    return c.json({
      success: true,
      message: status === 'approved' ? '✅ 已批准兑换' : '❌ 已拒绝兑换，积分已返还',
      status: status
    }, 200)

  } catch (error) {
    console.error('审批兑换错误:', error)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

// ========== 获取打卡统计数据（热力图） ==========
app.get('/api/stats/:childId', async (c) => {
  try {
    const childId = c.req.param('childId')

    if (!childId) {
      return c.json({ error: '孩子ID不能为空' }, 400)
    }

    // 获取最近30天的打卡数据
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const startDate = thirtyDaysAgo.toISOString().split('T')[0]

    const { data: checkins, error: queryError } = await supabase
      .from('checkins')
      .select('checkin_date, points_earned')
      .eq('child_id', childId)
      .gte('checkin_date', startDate)
      .order('checkin_date', { ascending: true })

    if (queryError) {
      return c.json({ error: '查询统计失败: ' + queryError.message }, 500)
    }

    // 按日期聚合
    const dateMap: Record<string, { count: number; totalPoints: number }> = {}
    checkins?.forEach((row: any) => {
      const date = row.checkin_date
      if (!dateMap[date]) {
        dateMap[date] = { count: 0, totalPoints: 0 }
      }
      dateMap[date].count += 1
      dateMap[date].totalPoints += row.points_earned
    })

    // 生成完整日期的数据（填充空白日期）
    const result = []
    const current = new Date(startDate)
    const end = new Date()
    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0]
      result.push({
        date: dateStr,
        count: dateMap[dateStr]?.count || 0,
        totalPoints: dateMap[dateStr]?.totalPoints || 0
      })
      current.setDate(current.getDate() + 1)
    }

    return c.json({
      success: true,
      stats: result
    }, 200)

  } catch (error) {
    console.error('获取统计错误:', error)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})
const port = 3001
console.log(`Server running at http://localhost:${port}`)
serve({
  fetch: app.fetch,
  port
})