import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  Alert, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useState } from 'react'
import { Scissors } from 'lucide-react-native'
import { useAuthStore } from '@/stores/auth'

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001'

const C = {
  ink: '#14120c', ink3: '#7a7560', bg: '#f0ece3',
  white: '#ffffff', rule: '#d8d2c4',
  gold: '#b8860b', goldBg: '#fdf8ee',
  terracotta: '#b5522a',
}

export default function LoginScreen() {
  const setAuth = useAuthStore(s => s.setAuth)
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [isLoading, setIsLoading] = useState(false)

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Please enter your email and password.')
      return
    }
    setIsLoading(true)
    try {
      // Sign in via Better Auth
      const res = await fetch(`${API_URL}/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Sign-in failed')

      const token = data.token ?? data.session?.token
      if (!token) throw new Error('No session token received')

      // Fetch worker context
      const [workerRes, shopRes] = await Promise.all([
        fetch(`${API_URL}/api/workers/me`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/shops/me`,   { headers: { Authorization: `Bearer ${token}` } }),
      ])
      const workerJson = await workerRes.json()
      const shopJson   = await shopRes.json()
      if (!workerRes.ok) throw new Error('Could not load worker profile')
      if (!shopRes.ok)   throw new Error('Could not load shop profile')

      await setAuth(token, workerJson.data, shopJson.data)
    } catch (err: any) {
      Alert.alert('Sign-in failed', err.message ?? 'Please check your credentials.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.container}>
          {/* Logo */}
          <View style={styles.logoRow}>
            <Scissors size={28} color={C.gold} />
            <Text style={styles.logoText}>StitchBook</Text>
          </View>

          <Text style={styles.subtitle}>Sign in to your shop</Text>

          {/* Form */}
          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={C.rule}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={C.rule}
                secureTextEntry
                autoComplete="current-password"
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
            </View>

            <TouchableOpacity
              style={[styles.signInBtn, isLoading && { opacity: 0.6 }]}
              onPress={handleLogin}
              disabled={isLoading}
            >
              {isLoading
                ? <ActivityIndicator color={C.white} />
                : <Text style={styles.signInLabel}>Sign In</Text>
              }
            </TouchableOpacity>
          </View>

          <Text style={styles.footNote}>
            New to StitchBook? Register your shop at{'\n'}
            <Text style={{ color: C.gold }}>app.stitchbook.app</Text>
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container:   { flex: 1, justifyContent: 'center', padding: 32 },
  logoRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  logoText:    { fontSize: 28, fontFamily: 'LibreBaskerville_400Regular', color: C.ink },
  subtitle:    { fontSize: 14, fontFamily: 'DMSans_400Regular', color: C.ink3, marginBottom: 40 },
  form:        { gap: 20 },
  field:       { gap: 6 },
  fieldLabel:  { fontSize: 11, fontFamily: 'DMMono_400Regular', letterSpacing: 1.5, textTransform: 'uppercase', color: C.ink3 },
  input:       { backgroundColor: C.white, borderWidth: 1, borderColor: C.rule, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 14, fontSize: 15, fontFamily: 'DMSans_400Regular', color: C.ink },
  signInBtn:   { backgroundColor: C.ink, borderRadius: 8, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  signInLabel: { fontSize: 15, fontFamily: 'DMSans_500Medium', color: C.white },
  footNote:    { fontSize: 12, fontFamily: 'DMSans_400Regular', color: C.ink3, textAlign: 'center', marginTop: 40, lineHeight: 20 },
})
