// IVaaRA Mobile — Device Detail Screen
import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  RefreshControl, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, riskColor, severityColor } from '../../constants/colors';
import { useDevice, useAlerts, useAIStatus, useTimeAgo } from '../../hooks';
import { sendEmergencyStop, getAIInsight } from '../../services/api';
import type { AIInsight } from '../../types';

export default function DeviceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const deviceId = Array.isArray(id) ? id[0] : id ?? '';
  const { device, loading, error, refresh } = useDevice(deviceId);
  const { alerts } = useAlerts(deviceId);
  const aiStatus = useAIStatus();
  const [refreshing, setRefreshing] = useState(false);
  const [eStopLoading, setEStopLoading] = useState(false);
  const [insight, setInsight] = useState<AIInsight | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const lastSeen = useTimeAgo(device?.last_seen ?? null);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const handleEmergencyStop = () => {
    Alert.alert(
      '⚠️ Emergency Stop',
      `Send emergency stop to ${deviceId}?\nThis will halt the IV pump immediately.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'CONFIRM STOP',
          style: 'destructive',
          onPress: async () => {
            setEStopLoading(true);
            try {
              await sendEmergencyStop(deviceId);
              Alert.alert('Emergency Stop Sent', 'The command was sent to the device.');
            } catch (e) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Failed to send command');
            } finally {
              setEStopLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleAnalyzeAI = async () => {
    if (!aiStatus?.ai_available) {
      Alert.alert('AI Unavailable', 'Set GROQ_API_KEY in backend .env to enable AI insights.');
      return;
    }
    setInsightLoading(true);
    try {
      const data = await getAIInsight(deviceId);
      setInsight(data);
    } catch (e) {
      Alert.alert('AI Error', e instanceof Error ? e.message : 'Failed to get AI insight');
    } finally {
      setInsightLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.primary} size="large" />
        <Text style={styles.loadingText}>Loading device…</Text>
      </View>
    );
  }

  if (error || !device) {
    return (
      <View style={styles.center}>
        <Ionicons name="warning-outline" size={48} color={Colors.offline} />
        <Text style={styles.errorText}>{error ?? 'Device not found'}</Text>
      </View>
    );
  }

  const tel = device.latest_telemetry;
  const isOnline = device.status === 'ONLINE';
  const risk = device.latest_risk_level;
  const activeAlerts = alerts.filter((a) => a.status === 'ACTIVE');

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      {/* Header card */}
      <View style={styles.headerCard}>
        <View style={styles.headerTop}>
          <Text style={styles.deviceId}>{device.device_id}</Text>
          <View style={[styles.statusBadge, { backgroundColor: isOnline ? '#dcfce7' : '#fee2e2' }]}>
            <View style={[styles.statusDot, { backgroundColor: isOnline ? Colors.online : Colors.offline }]} />
            <Text style={[styles.statusText, { color: isOnline ? '#166534' : '#991b1b' }]}>{device.status}</Text>
          </View>
        </View>
        <Text style={styles.deviceName}>{device.name}</Text>
        <Text style={styles.deviceMeta}>{device.iv_type ?? 'No fluid type'} · {device.bed_id ?? 'No bed'}</Text>
        <Text style={styles.lastSeen}>Last seen: {lastSeen}</Text>
      </View>

      {/* Active Alerts */}
      {activeAlerts.length > 0 && (
        <View style={styles.alertsBanner}>
          <Ionicons name="warning" size={16} color="#991b1b" />
          <Text style={styles.alertsBannerText}>{activeAlerts.length} Active Alert{activeAlerts.length > 1 ? 's' : ''}</Text>
        </View>
      )}

      {/* Telemetry Grid */}
      <Text style={styles.sectionLabel}>Live Telemetry</Text>
      <View style={styles.grid}>
        {[
          { label: 'Flow Rate', value: tel?.flow_rate?.toFixed(1) ?? '—', unit: 'drops/min', icon: 'water-outline' },
          { label: 'Temperature', value: tel?.temperature?.toFixed(1) ?? '—', unit: '°C', icon: 'thermometer-outline' },
          { label: 'Volume Left', value: tel?.remaining_volume_ml != null ? Math.round(tel.remaining_volume_ml).toString() : '—', unit: 'mL', icon: 'beaker-outline' },
          { label: 'Servo', value: tel?.servo_angle?.toString() ?? '—', unit: '°', icon: 'settings-outline' },
        ].map(({ label, value, unit, icon }) => (
          <View key={label} style={styles.gridItem}>
            <Ionicons name={icon as any} size={20} color={Colors.primary} />
            <Text style={styles.gridValue}>{value}</Text>
            <Text style={styles.gridUnit}>{unit}</Text>
            <Text style={styles.gridLabel}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Risk */}
      {risk && (
        <View style={[styles.riskCard, { borderColor: riskColor(risk) }]}>
          <Text style={styles.sectionLabel}>Risk Assessment</Text>
          <View style={styles.riskRow}>
            <Text style={[styles.riskLevel, { color: riskColor(risk) }]}>{risk}</Text>
            {device.latest_risk_score != null && (
              <Text style={styles.riskScore}>Score: {device.latest_risk_score.toFixed(0)}</Text>
            )}
          </View>
          <View style={styles.riskBar}>
            <View style={[styles.riskFill, { width: `${Math.min(100, device.latest_risk_score ?? 0)}%`, backgroundColor: riskColor(risk) }]} />
          </View>
        </View>
      )}

      {/* AI Insight */}
      <View style={styles.aiCard}>
        <View style={styles.aiHeader}>
          <Ionicons name="sparkles" size={16} color={Colors.primary} />
          <Text style={styles.sectionLabel}>AI Insight</Text>
          <TouchableOpacity style={styles.analyzeBtn} onPress={handleAnalyzeAI} disabled={insightLoading}>
            <Text style={styles.analyzeBtnText}>{insightLoading ? '…' : 'Analyze'}</Text>
          </TouchableOpacity>
        </View>
        {insightLoading ? (
          <ActivityIndicator color={Colors.primary} />
        ) : insight ? (
          <>
            <View style={styles.insightRow}>
              <Text style={styles.insightLabel}>Priority:</Text>
              <Text style={[styles.insightValue, { color: riskColor(insight.risk_level) }]}>{insight.risk_level.toUpperCase()}</Text>
            </View>
            <View style={styles.insightRow}>
              <Text style={styles.insightLabel}>Trend:</Text>
              <Text style={styles.insightValue}>{insight.trend.replace(/_/g, ' ')}</Text>
            </View>
            <View style={styles.insightRow}>
              <Text style={styles.insightLabel}>Anomaly:</Text>
              <Text style={[styles.insightValue, { color: insight.anomaly ? Colors.warning : Colors.online }]}>
                {insight.anomaly ? 'Detected' : 'None'}
              </Text>
            </View>
            <View style={styles.insightBox}>
              <Text style={styles.insightReason}>{insight.reason}</Text>
            </View>
            {insight.recommendation && (
              <Text style={styles.recommendation}>💡 {insight.recommendation}</Text>
            )}
          </>
        ) : (
          <Text style={styles.insightEmpty}>Tap "Analyze" to run AI risk assessment.</Text>
        )}
      </View>

      {/* Emergency Stop */}
      <TouchableOpacity
        style={[styles.eStopBtn, eStopLoading && { opacity: 0.5 }]}
        onPress={handleEmergencyStop}
        disabled={eStopLoading || !isOnline}
      >
        <Ionicons name="stop-circle" size={24} color="#fff" />
        <Text style={styles.eStopText}>
          {eStopLoading ? 'Sending…' : !isOnline ? 'Device Offline' : 'Emergency Stop'}
        </Text>
      </TouchableOpacity>

      {/* Recent Alerts */}
      {alerts.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Recent Alerts</Text>
          {alerts.slice(0, 5).map((a) => (
            <View key={a.id} style={styles.alertRow}>
              <View style={[styles.alertDot, { backgroundColor: severityColor(a.severity) }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.alertMessage}>{a.message}</Text>
                <Text style={styles.alertTime}>{new Date(a.timestamp).toLocaleString()}</Text>
              </View>
              <Text style={[styles.alertStatus, { color: a.status === 'ACTIVE' ? Colors.offline : Colors.online }]}>
                {a.status}
              </Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { marginTop: 12, color: Colors.textMuted, fontSize: 14 },
  errorText: { marginTop: 12, color: Colors.offline, fontSize: 15, textAlign: 'center' },
  headerCard: { backgroundColor: Colors.card, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.border },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  deviceId: { fontSize: 22, fontWeight: '800', color: Colors.primary, fontFamily: 'monospace' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, gap: 5 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '700' },
  deviceName: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary, marginBottom: 2 },
  deviceMeta: { fontSize: 13, color: Colors.textSecondary, marginBottom: 4 },
  lastSeen: { fontSize: 11, color: Colors.textMuted },
  alertsBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fee2e2', borderRadius: 10, padding: 12, marginBottom: 12 },
  alertsBannerText: { fontSize: 13, fontWeight: '700', color: '#991b1b' },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  gridItem: { backgroundColor: Colors.card, borderRadius: 12, padding: 14, alignItems: 'center', flex: 1, minWidth: '44%', borderWidth: 1, borderColor: Colors.border },
  gridValue: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary, marginTop: 6 },
  gridUnit: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  gridLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 4 },
  riskCard: { backgroundColor: Colors.card, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 2 },
  riskRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  riskLevel: { fontSize: 22, fontWeight: '800', textTransform: 'uppercase' },
  riskScore: { fontSize: 14, color: Colors.textSecondary, fontWeight: '600' },
  riskBar: { height: 6, backgroundColor: Colors.bg, borderRadius: 3, overflow: 'hidden' },
  riskFill: { height: '100%', borderRadius: 3 },
  aiCard: { backgroundColor: Colors.card, borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: Colors.border },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  analyzeBtn: { marginLeft: 'auto', backgroundColor: Colors.primary, paddingHorizontal: 14, paddingVertical: 5, borderRadius: 12 },
  analyzeBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  insightRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: Colors.bg },
  insightLabel: { fontSize: 13, color: Colors.textSecondary },
  insightValue: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  insightBox: { backgroundColor: Colors.bg, borderRadius: 8, padding: 10, marginTop: 8 },
  insightReason: { fontSize: 13, color: Colors.textPrimary, lineHeight: 18 },
  recommendation: { fontSize: 12, color: Colors.primary, marginTop: 8, lineHeight: 17 },
  insightEmpty: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', paddingVertical: 16 },
  eStopBtn: { backgroundColor: Colors.critical, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, gap: 10, marginBottom: 20 },
  eStopText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  alertRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: Colors.card, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  alertDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  alertMessage: { fontSize: 13, color: Colors.textPrimary, lineHeight: 17, marginBottom: 3 },
  alertTime: { fontSize: 11, color: Colors.textMuted },
  alertStatus: { fontSize: 10, fontWeight: '700' },
});
