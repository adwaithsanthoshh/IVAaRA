// IVaaRA Mobile — Alerts Screen
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, severityColor } from '../../constants/colors';
import { useAlerts } from '../../hooks';
import type { Alert } from '../../types';
import { useState } from 'react';

function AlertRow({ alert }: { alert: Alert }) {
  const isCritical = alert.severity === 'CRITICAL';
  const timeStr = new Date(alert.timestamp).toLocaleString();

  return (
    <View style={[styles.alertCard, isCritical && styles.criticalCard]}>
      <View style={styles.alertHeader}>
        <View style={[styles.severityDot, { backgroundColor: severityColor(alert.severity) }]} />
        <Text style={[styles.alertType, { color: severityColor(alert.severity) }]}>
          {alert.alert_type.replace(/_/g, ' ')}
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: alert.status === 'ACTIVE' ? '#fee2e2' : '#f0fdf4' }]}>
          <Text style={[styles.statusText, { color: alert.status === 'ACTIVE' ? Colors.critical : '#166534' }]}>
            {alert.status}
          </Text>
        </View>
      </View>
      <Text style={styles.deviceId}>{alert.device_id}</Text>
      <Text style={styles.message}>{alert.message}</Text>
      <Text style={styles.time}>{timeStr}</Text>
    </View>
  );
}

type Filter = 'ALL' | 'ACTIVE' | 'RESOLVED';

export default function AlertsScreen() {
  const [filter, setFilter] = useState<Filter>('ALL');
  const [refreshing, setRefreshing] = useState(false);
  const { alerts, loading, error, refresh } = useAlerts();

  const filtered = alerts.filter((a) => {
    if (filter === 'ALL') return true;
    return a.status === filter;
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const activeCount = alerts.filter((a) => a.status === 'ACTIVE').length;

  return (
    <View style={styles.container}>
      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {(['ALL', 'ACTIVE', 'RESOLVED'] as Filter[]).map((f) => (
          <TouchableOpacity
            key={f}
            onPress={() => setFilter(f)}
            style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f}{f === 'ACTIVE' && activeCount > 0 ? ` (${activeCount})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="warning" size={14} color="#991b1b" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={filtered}
        keyExtractor={(a) => a.id}
        renderItem={({ item }) => <AlertRow alert={item} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="checkmark-circle-outline" size={48} color={Colors.online} />
            <Text style={styles.emptyText}>{loading ? 'Loading alerts…' : 'No alerts'}</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  filterRow: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border },
  filterBtn: { flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center', backgroundColor: Colors.bg },
  filterBtnActive: { backgroundColor: Colors.primary },
  filterText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  filterTextActive: { color: '#fff' },
  alertCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  criticalCard: { borderColor: '#fca5a5', backgroundColor: '#fff5f5' },
  alertHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  severityDot: { width: 8, height: 8, borderRadius: 4 },
  alertType: { flex: 1, fontSize: 13, fontWeight: '700', textTransform: 'capitalize' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusText: { fontSize: 10, fontWeight: '700' },
  deviceId: { fontSize: 12, fontWeight: '700', color: Colors.primary, fontFamily: 'monospace', marginBottom: 4 },
  message: { fontSize: 13, color: Colors.textPrimary, lineHeight: 18, marginBottom: 6 },
  time: { fontSize: 11, color: Colors.textMuted },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fee2e2', margin: 12, borderRadius: 8, padding: 10 },
  errorText: { fontSize: 12, color: '#991b1b', flex: 1 },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 15, color: Colors.textMuted, marginTop: 12 },
});
