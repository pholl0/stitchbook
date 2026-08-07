import { Tabs } from 'expo-router'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { Users, ShoppingBag, BarChart2, Package, Settings } from 'lucide-react-native'

const GOLD = '#b8860b'
const INK3 = '#7a7560'
const WHITE = '#ffffff'
const SURFACE = '#faf8f4'

export default function AppLayout() {
  usePushNotifications()
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: WHITE,
          borderTopColor: '#d8d2c4',
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: GOLD,
        tabBarInactiveTintColor: INK3,
        tabBarLabelStyle: {
          fontFamily: 'DMSans_400Regular',
          fontSize: 10,
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <BarChart2 size={size - 2} color={color} strokeWidth={1.5} />,
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: 'Clients',
          tabBarIcon: ({ color, size }) => <Users size={size - 2} color={color} strokeWidth={1.5} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Orders',
          tabBarIcon: ({ color, size }) => <ShoppingBag size={size - 2} color={color} strokeWidth={1.5} />,
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: 'Inventory',
          tabBarIcon: ({ color, size }) => <Package size={size - 2} color={color} strokeWidth={1.5} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Settings size={size - 2} color={color} strokeWidth={1.5} />,
        }}
      />
    </Tabs>
  )
}
