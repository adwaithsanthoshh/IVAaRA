// IVaaRA Mobile — Settings Screen
import { View, Text, StyleSheet, TouchableOpacity, Switch, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { useSystemStatus, useAIStatus } from '../../hooks';
import { Config } from '../../constants/config';

export default function SettingsScreen() {
  const { status } = useSystemStatus();
  const aiStatus = useAIStatus();

  const clearCache = () => {
    Alert.alert('Cache Cleared', 'Local cache has been cleared.');
  };

  const showAbout = () => {
    Alert.alert(
      'IVaaRA Mobile',
      `Version: ${Config.APP_VERSION}\n\nIntra Venous Automation & Response Architecture\n\nBackend: ${Config.API_BASE_URL}`,
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Backend Connection */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Backend Connection</Text>
        <View style={styles.row}>
          <Ionicons name="server-outline" size={16} color={Colors.textSecondary} />
          <Text style={styles.rowLabel}>API URL</Text>
          <Text style={styles.rowValue} numberOfLines={1}>{Config.API_BASE_URL}</Text>
        </View>
        <View style={styles.row}>
          <Ionicons name="wifi-outline" size={16} color={Colors.textSecondary} />
          <Text style={styles.rowLabel}>Backend</Text>
          <Text style={[styles.rowValue, { color: status ? Colors.online : Colors.offline }]}>
            {status ? 'Connected' : 'Unavailable'}
          </Text>
        </View>
        <View style={styles.row}>
          <Ionicons name="radio-outline" size={16} color={Colors.textSecondary} />
          <Text style={styles.rowLabel}>MQTT</Text>
          <Text style={[styles.rowValue, { color: status?.mqtt_connected ? Colors.online : Colors.offline }]}>
            {status?.mqtt_connected ? 'Connected' : 'Disconnected'}
          </Text>
        </View>
      </View>

      {/* AI Status */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>AI Integration</Text>
        <View style={styles.row}>
          <Ionicons name="sparkles-outline" size={16} color={Colors.textSecondary} />
          <Text style={styles.rowLabel}>Groq AI</Text>
          <Text style={[styles.rowValue, { color: aiStatus?.ai_available ? Colors.online : Colors.warning }]}>
            {aiStatus?.ai_available
              ? `Active · ${aiStatus.key_count} key${aiStatus.key_count !== 1 ? 's' : ''}`
              : aiStatus?.status === 'CONFIGURATION_REQUIRED' ? 'Key Required' : 'Unavailable'}
          </Text>
        </View>
        {aiStatus?.model && (
          <View style={styles.row}>
            <Ionicons name="code-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.rowLabel}>Model</Text>
            <Text style={styles.rowValue}>{aiStatus.model}</Text>
          </View>
        )}
        {!aiStatus?.ai_available && (
          <View style={styles.hint}>
            <Text style={styles.hintText}>
              Set GROQ_API_KEY in your backend .env file to enable AI features.
            </Text>
          </View>
        )}
      </View>

      {/* App info */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>App</Text>
        <TouchableOpacity style={styles.row} onPress={clearCache}>
          <Ionicons name="trash-outline" size={16} color={Colors.textSecondary} />
          <Text style={styles.rowLabel}>Clear Cache</Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.row} onPress={showAbout}>
          <Ionicons name="information-circle-outline" size={16} color={Colors.textSecondary} />
          <Text style={styles.rowLabel}>About IVaaRA</Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>
        <View style={styles.row}>
          <Ionicons name="git-branch-outline" size={16} color={Colors.textSecondary} />
          <Text style={styles.rowLabel}>Version</Text>
          <Text style={styles.rowValue}>{Config.APP_VERSION}</Text>
        </View>
      </View>

      <Text style={styles.footer}>
        IVaaRA — Intra Venous Automation &amp; Response Architecture{'\n'}
        Medical-device hackathon prototype. Not for clinical use.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardTitle: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.bg },
  rowLabel: { fontSize: 14, color: Colors.textPrimary, flex: 1 },
  rowValue: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600', maxWidth: 180, textAlign: 'right' },
  hint: { backgroundColor: '#fff7ed', borderRadius: 8, padding: 10, marginTop: 8 },
  hintText: { fontSize: 12, color: '#92400e', lineHeight: 16 },
  footer: { textAlign: 'center', fontSize: 11, color: Colors.textMuted, lineHeight: 16, marginTop: 8 },
});
