// IVaaRA Mobile — AI Chat Screen
import { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { useDevices, useAIStatus } from '../../hooks';
import { askAI } from '../../services/api';
import type { AIChatResponse } from '../../types';

interface Message {
  id: string;
  role: 'user' | 'ai';
  text: string;
  timestamp: Date;
  aiAvailable?: boolean;
}

const QUICK_QUESTIONS = [
  'Why was this device flagged?',
  'Was the flow stable recently?',
  'Summarize this monitoring session.',
  'What is the risk trend?',
  'When did the last anomaly occur?',
];

export default function AIChatScreen() {
  const { devices } = useDevices();
  const aiStatus = useAIStatus();
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Auto-select first device
  useEffect(() => {
    if (devices.length > 0 && !selectedDeviceId) {
      setSelectedDeviceId(devices[0].device_id);
    }
  }, [devices, selectedDeviceId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages]);

  const send = async (q?: string) => {
    const text = (q ?? question).trim();
    if (!text || loading || !selectedDeviceId) return;

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', text, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setQuestion('');
    setLoading(true);

    try {
      const res: AIChatResponse = await askAI(selectedDeviceId, text);
      setMessages((prev) => [...prev, {
        id: `a-${Date.now()}`,
        role: 'ai',
        text: res.answer,
        timestamp: new Date(res.timestamp),
        aiAvailable: res.ai_available,
      }]);
    } catch (err) {
      setMessages((prev) => [...prev, {
        id: `e-${Date.now()}`,
        role: 'ai',
        text: 'Could not reach AI service. Check backend connectivity.',
        timestamp: new Date(),
        aiAvailable: false,
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        {/* Device Selector */}
        <View style={styles.deviceBar}>
          <Text style={styles.deviceBarLabel}>Device:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {devices.map((d) => (
              <TouchableOpacity
                key={d.device_id}
                onPress={() => { setSelectedDeviceId(d.device_id); setMessages([]); }}
                style={[styles.deviceChip, selectedDeviceId === d.device_id && styles.deviceChipActive]}
              >
                <Text style={[styles.deviceChipText, selectedDeviceId === d.device_id && styles.deviceChipTextActive]}>
                  {d.device_id}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* AI Status badge */}
        {aiStatus && (
          <View style={[styles.aiBadge, { backgroundColor: aiStatus.ai_available ? '#f0fdf4' : '#fff7ed' }]}>
            <Ionicons
              name={aiStatus.ai_available ? 'checkmark-circle' : 'alert-circle'}
              size={14}
              color={aiStatus.ai_available ? Colors.online : Colors.warning}
            />
            <Text style={[styles.aiBadgeText, { color: aiStatus.ai_available ? '#166534' : '#92400e' }]}>
              {aiStatus.ai_available
                ? `AI Ready · ${aiStatus.model}`
                : aiStatus.status === 'CONFIGURATION_REQUIRED'
                ? 'Set GROQ_API_KEY in backend .env to enable AI'
                : 'AI Unavailable'}
            </Text>
          </View>
        )}

        {/* Messages */}
        <ScrollView ref={scrollRef} style={styles.messages} contentContainerStyle={styles.messagesContent}>
          {messages.length === 0 && (
            <View style={styles.quickContainer}>
              <Text style={styles.quickLabel}>Quick questions:</Text>
              {QUICK_QUESTIONS.map((q) => (
                <TouchableOpacity key={q} style={styles.quickBtn} onPress={() => send(q)}>
                  <Text style={styles.quickText}>{q}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {messages.map((msg) => (
            <View key={msg.id} style={[styles.bubble, msg.role === 'user' ? styles.bubbleUser : styles.bubbleAI]}>
              {msg.role === 'ai' && msg.aiAvailable === false && (
                <Text style={styles.unavailableLabel}>AI Unavailable</Text>
              )}
              <Text style={[styles.bubbleText, msg.role === 'user' && styles.bubbleTextUser]}>
                {msg.text}
              </Text>
              <Text style={[styles.bubbleTime, msg.role === 'user' && { color: 'rgba(255,255,255,0.6)' }]}>
                {msg.timestamp.toLocaleTimeString()}
              </Text>
            </View>
          ))}
          {loading && (
            <View style={styles.thinkingBubble}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.thinkingText}>IVaaRA AI is thinking…</Text>
            </View>
          )}
        </ScrollView>

        {/* Input */}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder={selectedDeviceId ? `Ask about ${selectedDeviceId}…` : 'Select a device first'}
            placeholderTextColor={Colors.textMuted}
            value={question}
            onChangeText={setQuestion}
            onSubmitEditing={() => send()}
            editable={!!selectedDeviceId && !loading}
            returnKeyType="send"
            multiline={false}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!question.trim() || loading || !selectedDeviceId) && styles.sendBtnDisabled]}
            onPress={() => send()}
            disabled={!question.trim() || loading || !selectedDeviceId}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  deviceBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 8 },
  deviceBarLabel: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  deviceChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg, marginRight: 6 },
  deviceChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  deviceChipText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  deviceChipTextActive: { color: '#fff' },
  aiBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  aiBadgeText: { fontSize: 12, fontWeight: '600', flex: 1 },
  messages: { flex: 1 },
  messagesContent: { padding: 12, paddingBottom: 16 },
  quickContainer: { paddingTop: 8, gap: 6 },
  quickLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: 4 },
  quickBtn: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, padding: 10 },
  quickText: { fontSize: 13, color: Colors.textPrimary },
  bubble: { marginVertical: 4, maxWidth: '85%', padding: 12, borderRadius: 14 },
  bubbleUser: { backgroundColor: Colors.primary, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  bubbleAI: { backgroundColor: Colors.card, alignSelf: 'flex-start', borderWidth: 1, borderColor: Colors.border, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 14, color: Colors.textPrimary, lineHeight: 20 },
  bubbleTextUser: { color: '#fff' },
  bubbleTime: { fontSize: 10, color: Colors.textMuted, marginTop: 4 },
  unavailableLabel: { fontSize: 10, fontWeight: '700', color: Colors.warning, marginBottom: 4, textTransform: 'uppercase' },
  thinkingBubble: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, borderRadius: 14, borderBottomLeftRadius: 4, padding: 12, alignSelf: 'flex-start', marginVertical: 4 },
  thinkingText: { fontSize: 13, color: Colors.textMuted },
  inputRow: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: Colors.card, borderTopWidth: 1, borderTopColor: Colors.border },
  input: { flex: 1, backgroundColor: Colors.bg, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: Colors.textPrimary, borderWidth: 1, borderColor: Colors.border },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
});
