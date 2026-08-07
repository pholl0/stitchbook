import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { router } from 'expo-router'
import { format, parseISO, isPast, isToday } from 'date-fns'
import { AlertCircle, Clock, ChevronRight, Plus, Search, Bell } from 'lucide-react-native'
import { useState, useCallback } from 'react'
import { database, syncIfOnline } from '@/lib/db'
import { Q } from '@nozbe/watermelondb'
import { withObservables } from '@nozbe/watermelondb/react'
import { SyncStatusDot } from '@/components/SyncStatusDot'

const COLORS = {
  ink:       '#14120c',
  ink2:      '#3a3628',
  ink3:      '#7a7560',
  surface:   '#faf8f4',
  bg:        '#f0ece3',
  white:     '#ffffff',
  rule:      '#d8d2c4',
  gold:      '#b8860b',
  goldBg:    '#fdf8ee',
  terracotta:'#b5522a',
  sage:      '#2d6a4f',
}

function DashboardScreen() {
  const [refreshing, setRefreshing] = useState(false)

  // Query due today from WatermelonDB (works offline)
  const { data: dueOrders = [], refetch } = useQuery({
    queryKey: ['dashboard-due-orders'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0]!
      const orders = await database
        .get('orders')
        .query(
          Q.where('status', Q.notEq('delivered')),
          Q.where('status', Q.notEq('cancelled')),
          Q.where('due_date', Q.lte(today))
        )
        .fetch()
      return orders
    },
  })

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const [allOrders, allClients] = await Promise.all([
        database.get('orders').query(Q.where('status', Q.notEq('delivered'))).fetchCount(),
        database.get('clients').query(Q.where('is_active', true)).fetchCount(),
      ])
      return { activeOrders: allOrders, totalClients: allClients }
    },
  })

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await syncIfOnline()
    await refetch()
    setRefreshing(false)
  }, [refetch])

  const overdueOrders = dueOrders.filter(
    (o: any) => o.dueDate && isPast(parseISO(o.dueDate)) && !isToday(parseISO(o.dueDate))
  )
  const todayOrders = dueOrders.filter(
    (o: any) => o.dueDate && isToday(parseISO(o.dueDate))
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.gold}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Overview</Text>
            <Text style={styles.title}>Dashboard</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <TouchableOpacity onPress={() => router.push('/(app)/search')} style={{ padding: 4 }}>
              <Search size={20} color={COLORS.ink} strokeWidth={1.5} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/(app)/notifications')} style={{ padding: 4 }}>
              <Bell size={20} color={COLORS.ink} strokeWidth={1.5} />
            </TouchableOpacity>
            <SyncStatusDot />
          </View>
        </View>

        {/* Stats strip */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { borderLeftColor: COLORS.gold }]}>
            <Text style={styles.statValue}>{stats?.activeOrders ?? '—'}</Text>
            <Text style={styles.statLabel}>Active orders</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: COLORS.terracotta }]}>
            <Text style={[styles.statValue, overdueOrders.length > 0 && { color: COLORS.terracotta }]}>
              {overdueOrders.length}
            </Text>
            <Text style={styles.statLabel}>Overdue</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: COLORS.sage }]}>
            <Text style={styles.statValue}>{stats?.totalClients ?? '—'}</Text>
            <Text style={styles.statLabel}>Total clients</Text>
          </View>
        </View>

        {/* Overdue section */}
        {overdueOrders.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: COLORS.terracotta }]}>
              ⚠ Overdue ({overdueOrders.length})
            </Text>
            {overdueOrders.map((order: any) => (
              <OrderRow
                key={order.id}
                order={order}
                isOverdue
                onPress={() => router.push(`/orders/${order.serverId ?? order.id}`)}
              />
            ))}
          </View>
        )}

        {/* Due today section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Due Today ({todayOrders.length})
          </Text>
          {todayOrders.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Nothing due today ✓</Text>
            </View>
          ) : (
            todayOrders.map((order: any) => (
              <OrderRow
                key={order.id}
                order={order}
                onPress={() => router.push(`/orders/${order.serverId ?? order.id}`)}
              />
            ))
          )}
        </View>

        {/* Quick actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsRow}>
            <QuickAction
              label="New Client"
              icon={<Plus size={18} color={COLORS.gold} />}
              onPress={() => router.push('/clients/new')}
            />
            <QuickAction
              label="New Order"
              icon={<Plus size={18} color={COLORS.gold} />}
              onPress={() => router.push('/orders/new')}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function OrderRow({ order, isOverdue, onPress }: {
  order: any; isOverdue?: boolean; onPress: () => void
}) {
  return (
    <TouchableOpacity style={[styles.orderRow, isOverdue && styles.orderRowOverdue]} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <Text style={styles.orderClient}>{order.clientName}</Text>
        <Text style={styles.orderMeta}>
          {order.orderNumber}
          {order.dueDate && ` · ${format(parseISO(order.dueDate), 'd MMM')}`}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {isOverdue && <AlertCircle size={14} color={COLORS.terracotta} />}
        <ChevronRight size={14} color={COLORS.rule} />
      </View>
    </TouchableOpacity>
  )
}

function QuickAction({ label, icon, onPress }: {
  label: string; icon: React.ReactNode; onPress: () => void
}) {
  return (
    <TouchableOpacity style={styles.quickAction} onPress={onPress}>
      {icon}
      <Text style={styles.quickActionLabel}>{label}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container:       { padding: 20, paddingBottom: 40 },
  header:          { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 },
  eyebrow:         { fontSize: 10, letterSpacing: 3, textTransform: 'uppercase', color: COLORS.gold, fontFamily: 'DMMono_400Regular', marginBottom: 4 },
  title:           { fontSize: 28, fontFamily: 'LibreBaskerville_400Regular', color: COLORS.ink },
  statsRow:        { flexDirection: 'row', gap: 10, marginBottom: 24 },
  statCard:        { flex: 1, backgroundColor: COLORS.white, borderRadius: 4, padding: 14, borderLeftWidth: 3, shadowColor: COLORS.ink, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2 },
  statValue:       { fontSize: 24, fontFamily: 'LibreBaskerville_400Regular', color: COLORS.ink, lineHeight: 28 },
  statLabel:       { fontSize: 10, color: COLORS.ink3, fontFamily: 'DMMono_400Regular', marginTop: 4, letterSpacing: 0.5 },
  section:         { marginBottom: 24 },
  sectionTitle:    { fontSize: 12, fontFamily: 'DMMono_400Regular', letterSpacing: 2, textTransform: 'uppercase', color: COLORS.ink3, marginBottom: 10 },
  orderRow:        { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, padding: 14, borderRadius: 4, marginBottom: 2, borderWidth: 1, borderColor: COLORS.rule },
  orderRowOverdue: { borderColor: COLORS.terracotta, backgroundColor: '#fdf8f8' },
  orderClient:     { fontSize: 14, fontFamily: 'DMSans_500Medium', color: COLORS.ink, marginBottom: 2 },
  orderMeta:       { fontSize: 11, fontFamily: 'DMMono_400Regular', color: COLORS.ink3 },
  emptyState:      { backgroundColor: COLORS.white, padding: 20, borderRadius: 4, alignItems: 'center', borderWidth: 1, borderColor: COLORS.rule },
  emptyText:       { fontSize: 13, color: COLORS.sage, fontFamily: 'DMSans_400Regular' },
  actionsRow:      { flexDirection: 'row', gap: 10 },
  quickAction:     { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.white, padding: 14, borderRadius: 4, borderWidth: 1, borderColor: COLORS.rule },
  quickActionLabel:{ fontSize: 13, fontFamily: 'DMSans_400Regular', color: COLORS.ink },
})

export default DashboardScreen
