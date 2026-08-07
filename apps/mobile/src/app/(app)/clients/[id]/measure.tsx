import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, TextInput, KeyboardAvoidingView,
  Platform, Alert, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router, Stack } from 'expo-router'
import { useState, useRef, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react-native'
import { database } from '@/lib/db'
import type { Client, MeasurementSession, GarmentTemplate } from '@/lib/db/models'
import { Q } from '@nozbe/watermelondb'
import { useApiClient } from '@/hooks/useApiClient'
import { validateMeasurements, computeCutValues, hasErrors } from '@stitchbook/utils'
import type { FieldDefinition } from '@stitchbook/types'
import { BodyDiagram } from '@/components/BodyDiagram'

const C = {
  ink: '#14120c', ink2: '#3a3628', ink3: '#7a7560',
  bg: '#f0ece3', white: '#ffffff', rule: '#d8d2c4', rule2: '#e8e4da',
  gold: '#b8860b', goldBg: '#fdf8ee', goldDim: '#8a7030',
  sage: '#2d6a4f', sageBg: '#edf5f0',
  terracotta: '#b5522a', terracottaBg: '#fdf1ec',
  navy: '#1e3a5f', navyBg: '#edf1f7',
}

export default function MeasureScreen() {
  const { id: clientId, templateId } = useLocalSearchParams<{ id: string; templateId?: string }>()
  const api = useApiClient()
  const qc = useQueryClient()

  const [activeFieldIndex, setActiveFieldIndex] = useState(0)
  const [bodyValues, setBodyValues]   = useState<Record<string, string>>({})
  const [easeValues, setEaseValues]   = useState<Record<string, string>>({})
  const [postureNotes, setPostureNotes] = useState<Record<string, boolean>>({})
  const [fitNotes, setFitNotes]       = useState('')
  const [easeProfile, setEaseProfile] = useState<'fitted' | 'regular' | 'relaxed'>('regular')
  const [step, setStep]               = useState<'select_template' | 'measure' | 'posture' | 'review'>('select_template')
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null)
  const inputRef = useRef<TextInput>(null)

  // Load cached templates from WatermelonDB
  const { data: templates = [] } = useQuery({
    queryKey: ['templates-cached'],
    queryFn: () => database.get<GarmentTemplate>('garment_templates').query(Q.where('is_system', true)).fetch(),
  })

  // Load previous session for diff checking
  const { data: previousSession } = useQuery({
    queryKey: ['prev-session', clientId],
    queryFn: async () => {
      const sessions = await database
        .get<MeasurementSession>('measurement_sessions')
        .query(Q.where('client_id', clientId), Q.sortBy('session_date', Q.desc), Q.take(1))
        .fetch()
      return sessions[0] ?? null
    },
  })

  const fields: FieldDefinition[] = useMemo(() => {
    if (!selectedTemplate) return []
    return selectedTemplate.fields.filter((f: FieldDefinition) => f.layer === 'L1')
  }, [selectedTemplate])

  const l2Fields: FieldDefinition[] = useMemo(() => {
    if (!selectedTemplate) return []
    return selectedTemplate.fields.filter((f: FieldDefinition) => f.layer === 'L2')
  }, [selectedTemplate])

  // Auto-fill ease defaults when template is selected
  const handleSelectTemplate = useCallback((template: any) => {
    setSelectedTemplate(template)
    const defaults: Record<string, string> = {}
    Object.entries(template.easeDefaults ?? {}).forEach(([k, v]) => {
      defaults[k] = String(v)
    })
    setEaseValues(defaults)
    setStep('measure')
    setActiveFieldIndex(0)
  }, [])

  // Validation
  const validationResults = useMemo(() => {
    if (!selectedTemplate || Object.keys(bodyValues).length === 0) return []
    const numericBody: Record<string, number> = {}
    const numericEase: Record<string, number> = {}
    Object.entries(bodyValues).forEach(([k, v]) => {
      if (v !== '') numericBody[k] = parseFloat(v)
    })
    Object.entries(easeValues).forEach(([k, v]) => {
      if (v !== '') numericEase[k] = parseFloat(v)
    })
    return validateMeasurements({
      bodyValues: numericBody,
      easeValues: numericEase,
      fields: selectedTemplate.fields,
      previousBodyValues: previousSession
        ? JSON.parse(previousSession._bodyValuesRaw ?? '{}')
        : undefined,
    })
  }, [bodyValues, easeValues, selectedTemplate, previousSession])

  const errorsForField = (key: string) =>
    validationResults.filter(r => r.fieldKey === key)

  // Save session mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const numericBody: Record<string, number> = {}
      const numericEase: Record<string, number> = {}
      Object.entries(bodyValues).forEach(([k, v]) => {
        if (v !== '') numericBody[k] = parseFloat(v)
      })
      Object.entries(easeValues).forEach(([k, v]) => {
        if (v !== '') numericEase[k] = parseFloat(v)
      })

      // Compute L3 cut values locally
      const cutValues = computeCutValues(numericBody, numericEase, selectedTemplate.fields)

      // Save to WatermelonDB first (works offline)
      await database.write(async () => {
        const clientRecord = await database
          .get<Client>('clients')
          .query(Q.where('server_id', clientId))
          .fetch()

        await database.get<MeasurementSession>('measurement_sessions').create((record: any) => {
          record.clientId     = clientRecord[0]?.id ?? clientId
          record.shopId       = clientRecord[0]?.shopId ?? ''
          record.templateId   = selectedTemplate.serverId
          record.templateName = selectedTemplate.name
          record.sessionType  = 'garment_specific'
          record.sessionDate  = new Date().toISOString().split('T')[0]
          record.unit         = 'cm'
          record.easeProfile  = easeProfile
          record._bodyValuesRaw  = JSON.stringify(numericBody)
          record._easeValuesRaw  = JSON.stringify(numericEase)
          record._cutValuesRaw   = JSON.stringify(cutValues)
          record._postureNotesRaw = JSON.stringify(postureNotes)
          record.fitNotesText = fitNotes
          record.isPinned     = false
          record.isClientSubmission = false
        })
      })

      // Also push to API (non-blocking — will sync later if offline)
      try {
        await api.post('/measurements', {
          clientId,
          templateId: selectedTemplate.serverId,
          sessionType: 'garment_specific',
          unit: 'cm',
          easeProfile,
          bodyValues: numericBody,
          easeValues: numericEase,
          cutValuesOverride: cutValues,
          postureNotes,
          fitNotesText: fitNotes,
        })
      } catch {
        // Offline — will sync when back online
      }

      return { success: true }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['measurement-sessions', clientId] })
      qc.invalidateQueries({ queryKey: ['prev-session', clientId] })
      Alert.alert(
        'Saved',
        'Measurements recorded successfully.',
        [{ text: 'Done', onPress: () => router.back() }]
      )
    },
    onError: (err: any) => {
      Alert.alert('Error', err.message ?? 'Failed to save. Please try again.')
    },
  })

  const currentField = fields[activeFieldIndex]
  const progressPct = fields.length > 0 ? ((activeFieldIndex) / fields.length) * 100 : 0

  // ── Template selection ──────────────────────────────────────
  if (step === 'select_template') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <ArrowLeft size={20} color={C.ink} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>New Measurement Session</Text>
          <View style={{ width: 20 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <Text style={styles.sectionLabel}>Select Garment Type</Text>

          {/* Group templates by category */}
          {['menswear', 'womenswear', 'ethnic_south_asian', 'ethnic_west_african',
            'ethnic_middle_eastern', 'bridal', 'childrens'].map(category => {
            const catTemplates = templates.filter((t: any) => t.category === category)
            if (!catTemplates.length) return null
            return (
              <View key={category} style={{ marginBottom: 20 }}>
                <Text style={styles.categoryLabel}>
                  {category.replace(/_/g, ' ').toUpperCase()}
                </Text>
                {catTemplates.map((template: any) => (
                  <TouchableOpacity
                    key={template.id}
                    style={styles.templateCard}
                    onPress={() => handleSelectTemplate(template)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.templateName}>{template.name}</Text>
                      <Text style={styles.templateMeta}>
                        {template.fields.length} fields
                      </Text>
                    </View>
                    <ChevronRight size={14} color={C.rule} />
                  </TouchableOpacity>
                ))}
              </View>
            )
          })}
        </ScrollView>
      </SafeAreaView>
    )
  }

  // ── Measurement entry ───────────────────────────────────────
  if (step === 'measure' && currentField) {
    const fieldErrors = errorsForField(currentField.key)
    const currentVal = bodyValues[currentField.key] ?? ''

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => {
              if (activeFieldIndex === 0) setStep('select_template')
              else setActiveFieldIndex(i => i - 1)
            }}>
              <ArrowLeft size={20} color={C.ink} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{selectedTemplate.name}</Text>
            <Text style={[styles.fieldCounter, { fontFamily: 'DMMono_400Regular' }]}>
              {activeFieldIndex + 1}/{fields.length}
            </Text>
          </View>

          {/* Progress bar */}
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 24 }}>
            {/* Body diagram */}
            <BodyDiagram
              activeField={currentField.key}
              diagramVariant={selectedTemplate.diagramVariant}
              completedFields={Object.keys(bodyValues).filter(k => bodyValues[k] !== '')}
            />

            {/* Field label */}
            <Text style={styles.fieldLabel}>{currentField.label}</Text>
            {currentField.helperRequired && (
              <Text style={styles.helperNote}>👥 Helper recommended for this measurement</Text>
            )}

            {/* Main input */}
            <View style={[
              styles.inputWrap,
              fieldErrors.some(e => e.severity === 'error') && styles.inputError,
            ]}>
              <TextInput
                ref={inputRef}
                style={styles.measureInput}
                value={currentVal}
                onChangeText={v => setBodyValues(prev => ({ ...prev, [currentField.key]: v }))}
                keyboardType="decimal-pad"
                placeholder="0.0"
                placeholderTextColor={C.rule}
                returnKeyType="next"
                autoFocus
                onSubmitEditing={() => {
                  if (activeFieldIndex < fields.length - 1) setActiveFieldIndex(i => i + 1)
                }}
              />
              <Text style={styles.unitLabel}>cm</Text>
            </View>

            {/* Validation messages */}
            {fieldErrors.map((err, i) => (
              <View key={i} style={[
                styles.validationMsg,
                err.severity === 'error' ? styles.validationError : styles.validationWarn,
              ]}>
                <AlertTriangle size={12} color={err.severity === 'error' ? C.terracotta : C.gold} />
                <Text style={[
                  styles.validationText,
                  { color: err.severity === 'error' ? C.terracotta : C.gold },
                ]}>
                  {err.message}
                </Text>
              </View>
            ))}

            {/* Ease field (if applicable) */}
            {(() => {
              const easeField = l2Fields.find(f => f.key === `${currentField.key.replace('_body', '')}_ease`)
              if (!easeField) return null
              return (
                <View style={styles.easeRow}>
                  <Text style={styles.easeLabel}>Ease allowance</Text>
                  <TextInput
                    style={styles.easeInput}
                    value={easeValues[easeField.key] ?? ''}
                    onChangeText={v => setEaseValues(prev => ({ ...prev, [easeField.key]: v }))}
                    keyboardType="decimal-pad"
                    placeholder={String(easeField.defaultValue ?? 0)}
                    placeholderTextColor={C.rule}
                  />
                  <Text style={styles.easeUnit}>cm</Text>
                </View>
              )
            })()}
          </ScrollView>

          {/* Nav buttons */}
          <View style={styles.navRow}>
            <TouchableOpacity
              style={styles.navBtn}
              onPress={() => setActiveFieldIndex(i => Math.max(0, i - 1))}
              disabled={activeFieldIndex === 0}
            >
              <ChevronLeft size={18} color={activeFieldIndex === 0 ? C.rule : C.ink} />
              <Text style={[styles.navLabel, activeFieldIndex === 0 && { color: C.rule }]}>Prev</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.navBtnSkip}
              onPress={() => setBodyValues(prev => ({ ...prev, [currentField.key]: '' }))}
            >
              <Text style={styles.skipLabel}>Skip</Text>
            </TouchableOpacity>

            {activeFieldIndex < fields.length - 1 ? (
              <TouchableOpacity
                style={[styles.navBtn, styles.navBtnNext]}
                onPress={() => setActiveFieldIndex(i => i + 1)}
              >
                <Text style={styles.nextLabel}>Next</Text>
                <ChevronRight size={18} color={C.white} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.navBtn, styles.navBtnNext]}
                onPress={() => setStep('posture')}
              >
                <Text style={styles.nextLabel}>Posture</Text>
                <ChevronRight size={18} color={C.white} />
              </TouchableOpacity>
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }

  // ── Posture notes ───────────────────────────────────────────
  if (step === 'posture') {
    const POSTURE_OPTIONS = [
      { key: 'swayback',               label: 'Sway back' },
      { key: 'forward_head',           label: 'Forward head posture' },
      { key: 'sloped_shoulder_right',  label: 'Right shoulder lower' },
      { key: 'sloped_shoulder_left',   label: 'Left shoulder lower' },
      { key: 'prominent_blades',       label: 'Prominent shoulder blades' },
      { key: 'uneven_hips',            label: 'Uneven hips' },
      { key: 'full_seat',              label: 'Full seat' },
      { key: 'flat_seat',              label: 'Flat seat' },
      { key: 'round_back',             label: 'Round back / kyphosis' },
    ]

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setStep('measure')}>
            <ArrowLeft size={20} color={C.ink} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Posture & Fit Notes</Text>
          <View style={{ width: 20 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <Text style={styles.sectionLabel}>Posture observations</Text>
          <Text style={styles.helpText}>Select any that apply to this client</Text>

          {POSTURE_OPTIONS.map(opt => {
            const isOn = !!postureNotes[opt.key]
            return (
              <TouchableOpacity
                key={opt.key}
                style={[styles.postureToggle, isOn && styles.postureToggleOn]}
                onPress={() => setPostureNotes(prev => ({ ...prev, [opt.key]: !prev[opt.key] }))}
              >
                <View style={[styles.checkbox, isOn && styles.checkboxOn]}>
                  {isOn && <Check size={10} color={C.white} />}
                </View>
                <Text style={[styles.postureToggleLabel, isOn && { color: C.ink }]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            )
          })}

          <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Free-text notes</Text>
          <TextInput
            style={styles.notesInput}
            value={fitNotes}
            onChangeText={setFitNotes}
            multiline
            numberOfLines={4}
            placeholder="Any additional observations about fit, posture, or style preferences…"
            placeholderTextColor={C.ink3}
            textAlignVertical="top"
          />
        </ScrollView>

        <View style={styles.saveBar}>
          <TouchableOpacity
            style={styles.saveBtn}
            onPress={() => setStep('review')}
          >
            <Text style={styles.saveBtnText}>Review & Save →</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  // ── Review & save ───────────────────────────────────────────
  if (step === 'review') {
    const errCount = validationResults.filter(r => r.severity === 'error').length
    const warnCount = validationResults.filter(r => r.severity === 'warning').length

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setStep('posture')}>
            <ArrowLeft size={20} color={C.ink} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Review Measurements</Text>
          <View style={{ width: 20 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 20 }}>
          {errCount > 0 && (
            <View style={[styles.validationMsg, styles.validationError, { marginBottom: 16 }]}>
              <AlertTriangle size={14} color={C.terracotta} />
              <Text style={{ color: C.terracotta, fontSize: 13, fontFamily: 'DMSans_400Regular' }}>
                {errCount} error{errCount > 1 ? 's' : ''} must be fixed before saving
              </Text>
            </View>
          )}

          {warnCount > 0 && errCount === 0 && (
            <View style={[styles.validationMsg, styles.validationWarn, { marginBottom: 16 }]}>
              <AlertTriangle size={14} color={C.gold} />
              <Text style={{ color: C.gold, fontSize: 13, fontFamily: 'DMSans_400Regular' }}>
                {warnCount} warning{warnCount > 1 ? 's' : ''} — review before saving
              </Text>
            </View>
          )}

          {/* Summary table */}
          <View style={styles.reviewTable}>
            {fields.map((field, i) => {
              const val = bodyValues[field.key]
              const isBlank = !val || val === ''
              return (
                <TouchableOpacity
                  key={field.key}
                  style={[styles.reviewRow, i < fields.length - 1 && { borderBottomWidth: 1, borderBottomColor: C.rule2 }]}
                  onPress={() => { setActiveFieldIndex(i); setStep('measure') }}
                >
                  <Text style={styles.reviewLabel}>{field.label}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.reviewVal, isBlank && { color: C.rule }]}>
                      {isBlank ? (field.required ? '⚠ Required' : '—') : `${val} cm`}
                    </Text>
                  </View>
                </TouchableOpacity>
              )
            })}
          </View>
        </ScrollView>

        <View style={styles.saveBar}>
          <TouchableOpacity
            style={[styles.saveBtn, (errCount > 0 || saveMutation.isPending) && { opacity: 0.5 }]}
            onPress={() => saveMutation.mutate()}
            disabled={errCount > 0 || saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <ActivityIndicator color={C.white} />
            ) : (
              <Text style={styles.saveBtnText}>
                {errCount > 0 ? 'Fix errors to save' : 'Save Measurements'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  return null
}

const styles = StyleSheet.create({
  header:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 12, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.rule },
  headerTitle:      { fontSize: 16, fontFamily: 'LibreBaskerville_400Regular', color: C.ink },
  fieldCounter:     { fontSize: 12, color: C.ink3 },
  progressBar:      { height: 2, backgroundColor: C.rule2 },
  progressFill:     { height: 2, backgroundColor: C.gold },
  sectionLabel:     { fontSize: 10, letterSpacing: 2.5, textTransform: 'uppercase', fontFamily: 'DMMono_400Regular', color: C.gold, marginBottom: 12 },
  categoryLabel:    { fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', fontFamily: 'DMMono_400Regular', color: C.ink3, marginBottom: 8, paddingLeft: 4 },
  templateCard:     { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, padding: 16, borderRadius: 6, borderWidth: 1, borderColor: C.rule, marginBottom: 6 },
  templateName:     { fontSize: 15, fontFamily: 'DMSans_500Medium', color: C.ink, marginBottom: 2 },
  templateMeta:     { fontSize: 11, fontFamily: 'DMMono_400Regular', color: C.ink3 },
  fieldLabel:       { fontSize: 24, fontFamily: 'LibreBaskerville_400Regular', color: C.ink, marginBottom: 8, textAlign: 'center' },
  helperNote:       { fontSize: 12, fontFamily: 'DMSans_400Regular', color: C.navy, textAlign: 'center', marginBottom: 12 },
  inputWrap:        { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderWidth: 2, borderColor: C.gold, borderRadius: 8, marginBottom: 12, paddingHorizontal: 16 },
  inputError:       { borderColor: C.terracotta },
  measureInput:     { flex: 1, fontSize: 40, fontFamily: 'LibreBaskerville_400Regular', color: C.ink, paddingVertical: 16, textAlign: 'center' },
  unitLabel:        { fontSize: 16, fontFamily: 'DMMono_400Regular', color: C.ink3 },
  validationMsg:    { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: 4, marginBottom: 8 },
  validationError:  { backgroundColor: C.terracottaBg },
  validationWarn:   { backgroundColor: C.goldBg },
  validationText:   { fontSize: 12, fontFamily: 'DMSans_400Regular', flex: 1 },
  easeRow:          { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  easeLabel:        { flex: 1, fontSize: 12, fontFamily: 'DMMono_400Regular', color: C.ink3 },
  easeInput:        { width: 60, borderWidth: 1, borderColor: C.rule, borderRadius: 4, padding: 8, fontSize: 14, fontFamily: 'DMMono_400Regular', color: C.ink, textAlign: 'center' },
  easeUnit:         { fontSize: 11, fontFamily: 'DMMono_400Regular', color: C.ink3 },
  navRow:           { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.rule },
  navBtn:           { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12, borderRadius: 6, borderWidth: 1, borderColor: C.rule },
  navBtnNext:       { flex: 1, justifyContent: 'center', backgroundColor: C.ink, borderColor: C.ink },
  navBtnSkip:       { paddingHorizontal: 16, paddingVertical: 12 },
  navLabel:         { fontSize: 13, fontFamily: 'DMSans_400Regular', color: C.ink },
  nextLabel:        { fontSize: 13, fontFamily: 'DMSans_500Medium', color: C.white },
  skipLabel:        { fontSize: 12, fontFamily: 'DMMono_400Regular', color: C.ink3 },
  helpText:         { fontSize: 13, fontFamily: 'DMSans_400Regular', color: C.ink3, marginBottom: 16 },
  postureToggle:    { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: C.white, borderRadius: 6, borderWidth: 1, borderColor: C.rule, marginBottom: 6 },
  postureToggleOn:  { borderColor: C.sage, backgroundColor: C.sageBg },
  checkbox:         { width: 18, height: 18, borderRadius: 3, borderWidth: 1.5, borderColor: C.rule, alignItems: 'center', justifyContent: 'center' },
  checkboxOn:       { backgroundColor: C.sage, borderColor: C.sage },
  postureToggleLabel:{ fontSize: 14, fontFamily: 'DMSans_400Regular', color: C.ink3 },
  notesInput:       { backgroundColor: C.white, borderWidth: 1, borderColor: C.rule, borderRadius: 6, padding: 14, fontSize: 14, fontFamily: 'DMSans_400Regular', color: C.ink, minHeight: 100 },
  saveBar:          { padding: 16, backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.rule },
  saveBtn:          { backgroundColor: C.ink, borderRadius: 8, padding: 16, alignItems: 'center' },
  saveBtnText:      { fontSize: 15, fontFamily: 'DMSans_500Medium', color: C.white },
  reviewTable:      { backgroundColor: C.white, borderRadius: 6, borderWidth: 1, borderColor: C.rule, overflow: 'hidden' },
  reviewRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  reviewLabel:      { fontSize: 13, fontFamily: 'DMSans_400Regular', color: C.ink3, flex: 1 },
  reviewVal:        { fontSize: 13, fontFamily: 'DMMono_400Regular', color: C.ink },
})
