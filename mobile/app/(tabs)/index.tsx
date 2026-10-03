// IVaaRA Mobile — Dashboard Screen
import React from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  RefreshControl, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, riskColor } from '../../constants/colors';
import { useDevices, useSystemStatus, useAIStatus, useTimeAgo } from '../../hooks';
import type { Device } from '../../types';

function StatusChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <View style={[styles.chip, { backgroundColor: ok ? '#dcfce7' : '#fee2e2' }]}>
      <View style={[styles.chipDot, { backgroundColor: ok ? Colors.online : Colors.offline }]} />
      <Text style={[styles.chipText, { color: ok ? '#166534' : '#991b1b' }]}>{label}</Text>
    </View>
  );
}

function DeviceCard({ device }: { device: Device }) {
  const router = useRouter();
  const tel = device.latest_telemetry;
  const isOnline = device.status === 'ONLINE';
  const lastSeen = useTimeAgo(device.last_seen);
  const risk = device.latest_risk_level ?? 'UNKNOWN';

  return (
    <TouchableOpacity
      style={styles.deviceCard}
      onPress={() => router.push({ pathname: '/device/[id]', params: { id: device.device_id } } as any)}
      activeOpacity={0.8}
    >
      <View style={styles.deviceHeader}>
        <View style={styles.deviceTitleRow}>
          <Text style={styles.deviceId}>{device.device_id}</Text>
          <View style={[styles.statusBadge, { backgroundColor: isOnline ? '#dcfce7' : '#fee2e2' }]}>
            <View style={[styles.statusDot, { backgroundColor: isOnline ? Colors.online : Colors.offline }]} />
            <Text style={[styles.statusText, { color: isOnline ? '#166534' : '#991b1b' }]}>
              {device.status}
            </Text>
          </View>
        </View>
        <Text style={styles.deviceName}>{device.name}</Text>
        <Text style={styles.deviceBed}>{device.iv_type ?? 'No fluid type set'} · {device.bed_id ?? 'No bed'}</Text>
      </View>

      <View style={styles.deviceMetrics}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Flow</Text>
          <Text style={styles.metricValue}>
            {tel?.flow_rate != null ? tel.flow_rate.toFixed(1) : '—'}
          </Text>
          <Text style={styles.metricUnit}>drops/min</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Temp</Text>
          <Text style={styles.metricValue}>
            {tel?.temperature != null ? tel.temperature.toFixed(1) : '—'}
          </Text>
          <Text style={styles.metricUnit}>°C</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Risk</Text>
          <Text style={[styles.metricValue, { color: riskColor(risk), fontSize: 15 }]}>{risk}</Text>
          <Text style={styles.metricUnit}>level</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Volume</Text>
          <Text style={styles.metricValue}>
            {tel?.remaining_volume_ml != null ? Math.round(tel.remaining_volume_ml) : '—'}
          </Text>
          <Text style={styles.metricUnit}>mL left</Text>
        </View>
      </View>

      <View style={styles.deviceFooter}>
        <Ionicons name="time-outline" size={12} color={Colors.textMuted} />
        <Text style={styles.lastSeen}>Last seen: {lastSeen}</Text>
        <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} style={{ marginLeft: 'auto' }} />
      </View>
    </TouchableOpacity>
  );
}

export default function DashboardScreen() {
  const { devices, loading: devLoading, error: devError, refresh: refreshDevices } = useDevices();
  const { status, loading: sysLoading, refresh: refreshStatus } = useSystemStatus();
  const aiStatus = useAIStatus();
  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshDevices(), refreshStatus()]);
    setRefreshing(false);
  };

  const backendOk = !!status && status.backend_status !== 'ERROR';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      {/* System Status Banner */}
      <View style={styles.systemCard}>
        <Text style={styles.sectionTitle}>System Status</Text>
        <View style={styles.chipRow}>
          <StatusChip ok={backendOk} label={backendOk ? 'Backend Online' : 'Backend Offline'} />
          <StatusChip ok={status?.mqtt_connected ?? false} label={status?.mqtt_connected ? 'MQTT OK' : 'MQTT Down'} />
          <StatusChip ok={aiStatus?.ai_available ?? false} label={aiStatus?.ai_available ? 'AI Ready' : 'AI Off'} />
        </View>
        {status && (
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{status.online_devices}</Text>
              <Text style={styles.statLabel}>Online</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: status.active_alerts > 0 ? Colors.warning : Colors.textPrimary }]}>
                {status.active_alerts}
              </Text>
              <Text style={styles.statLabel}>Alerts</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{status.total_devices}</Text>
              <Text style={styles.statLabel}>Devices</Text>
            </View>
          </View>
        )}
        {devError && (
          <View style={styles.errorBanner}>
            <Ionicons name="warning-outline" size={14} color="#991b1b" />
            <Text style={styles.errorText}>Backend unavailable. Check network.</Text>
          </View>
        )}
      </View>

      {/* Device List */}
      <Text style={styles.sectionHeader}>IV Devices</Text>

      {devLoading && !refreshing ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 32 }} />
      ) : devices.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="hardware-chip-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyText}>No devices registered</Text>
          <Text style={styles.emptySubtext}>Register an ESP32 device in the web dashboard.</Text>
        </View>
      ) : (
        devices.map((d) => <DeviceCard key={d.device_id} device={d} />)
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: 16, paddingBottom: 32 },
  systemCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, gap: 5 },
  chipDot: { width: 7, height: 7, borderRadius: 4 },
  chipText: { fontSize: 12, fontWeight: '600' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 12 },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  statLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fee2e2', borderRadius: 8, padding: 8, marginTop: 8 },
  errorText: { fontSize: 12, color: '#991b1b' },
  sectionHeader: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 10 },
  deviceCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  deviceHeader: { marginBottom: 12 },
  deviceTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  deviceId: { fontSize: 17, fontWeight: '800', color: Colors.primary, fontFamily: 'monospace' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, gap: 4 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },
  deviceName: { fontSize: 13, color: Colors.textPrimary, fontWeight: '600' },
  deviceBed: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  deviceMetrics: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: Colors.bg, borderRadius: 8, padding: 10, marginBottom: 10 },
  metric: { alignItems: 'center', flex: 1 },
  metricLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  metricValue: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, marginTop: 2 },
  metricUnit: { fontSize: 9, color: Colors.textMuted, marginTop: 1 },
  deviceFooter: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lastSeen: { fontSize: 11, color: Colors.textMuted },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyText: { fontSize: 16, fontWeight: '600', color: Colors.textSecondary, marginTop: 12 },
  emptySubtext: { fontSize: 13, color: Colors.textMuted, marginTop: 4, textAlign: 'center' },
  textPrimary: { color: Colors.textPrimary },
});
