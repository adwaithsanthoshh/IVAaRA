// IVaaRA Mobile — Devices Screen
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, riskColor } from '../../constants/colors';
import { useDevices, useTimeAgo } from '../../hooks';
import type { Device } from '../../types';
import { useState } from 'react';

function DeviceRow({ device }: { device: Device }) {
  const router = useRouter();
  const tel = device.latest_telemetry;
  const isOnline = device.status === 'ONLINE';
  const lastSeen = useTimeAgo(device.last_seen);

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => router.push({ pathname: '/device/[id]', params: { id: device.device_id } } as any)}
      activeOpacity={0.8}
    >
      <View style={[styles.onlineIndicator, { backgroundColor: isOnline ? Colors.online : Colors.offline }]} />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.deviceId}>{device.device_id}</Text>
          <Text style={[styles.riskLabel, { color: riskColor(device.latest_risk_level) }]}>
            {device.latest_risk_level ?? '—'}
          </Text>
        </View>
        <Text style={styles.deviceName}>{device.name}</Text>
        <View style={styles.rowMeta}>
          <Text style={styles.meta}>
            Flow: <Text style={styles.metaValue}>{tel?.flow_rate?.toFixed(1) ?? '—'} d/min</Text>
          </Text>
          <Text style={styles.meta}>
            Temp: <Text style={styles.metaValue}>{tel?.temperature?.toFixed(1) ?? '—'} °C</Text>
          </Text>
          <Text style={styles.meta}>{lastSeen}</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
    </TouchableOpacity>
  );
}

export default function DevicesScreen() {
  const { devices, loading, error, refresh } = useDevices();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="warning" size={14} color="#991b1b" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      <FlatList
        data={devices}
        keyExtractor={(d) => d.device_id}
        renderItem={({ item }) => <DeviceRow device={item} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="hardware-chip-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>{loading ? 'Loading devices…' : 'No devices found'}</Text>
          </View>
        }
        contentContainerStyle={devices.length === 0 ? styles.emptyContainer : { paddingBottom: 20 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  onlineIndicator: { width: 6, height: '80%', borderRadius: 3, marginRight: 12, minHeight: 40 },
  rowBody: { flex: 1 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  deviceId: { fontSize: 16, fontWeight: '800', color: Colors.primary, fontFamily: 'monospace' },
  riskLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  deviceName: { fontSize: 13, color: Colors.textSecondary, marginBottom: 6 },
  rowMeta: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  meta: { fontSize: 11, color: Colors.textMuted },
  metaValue: { fontWeight: '700', color: Colors.textPrimary },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fee2e2', margin: 12, borderRadius: 8, padding: 10 },
  errorText: { fontSize: 12, color: '#991b1b', flex: 1 },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 15, color: Colors.textMuted, marginTop: 12 },
  emptyContainer: { flex: 1, justifyContent: 'center' },
});
