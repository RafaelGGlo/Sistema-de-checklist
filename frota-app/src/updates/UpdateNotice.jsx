import React, { useEffect, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Updates from 'expo-updates';
import { useIsFocused } from '@react-navigation/native';

// Only mounted on Login/Home: a reload can never interrupt a checklist or photo.
export default function UpdateNotice({ blocked = false }) {
  const focused = useIsFocused();
  const { isUpdatePending } = Updates.useUpdates();
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState('');
  const checking = useRef(false);

  useEffect(() => {
    if (__DEV__ || Platform.OS !== 'android' || !Updates.isEnabled || !focused) return;
    let active = true;
    async function check() {
      if (checking.current) return;
      checking.current = true;
      try {
        const update = await Updates.checkForUpdateAsync();
        if (active && update.isAvailable) await Updates.fetchUpdateAsync();
      } catch {
        // Offline or server unavailable: continue using the installed version.
      } finally {
        checking.current = false;
      }
    }
    void check();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void check();
    });
    return () => { active = false; subscription.remove(); };
  }, [focused]);

  if (!focused || blocked || !Updates.isEnabled || !isUpdatePending) return null;

  async function restart() {
    if (reloading) return;
    setReloading(true);
    setError('');
    try {
      await Updates.reloadAsync();
    } catch {
      setReloading(false);
      setError('Não foi possível reiniciar. Feche e abra o aplicativo.');
    }
  }

  return (
    <View style={styles.notice} accessibilityLiveRegion="polite">
      <Text style={styles.text}>Uma atualização está pronta.</Text>
      <TouchableOpacity accessibilityRole="button" disabled={reloading} onPress={restart} style={styles.button}>
        <Text style={styles.buttonText}>{reloading ? 'Reiniciando…' : 'Atualizar agora'}</Text>
      </TouchableOpacity>
      {!!error && <Text style={styles.text}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { backgroundColor: '#173b30', borderRadius: 10, padding: 12, marginVertical: 8, alignSelf: 'stretch', gap: 8 },
  text: { color: '#e7fff3', fontSize: 14, textAlign: 'center' },
  button: { backgroundColor: '#48b889', borderRadius: 8, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  buttonText: { color: '#08291c', fontSize: 14, fontWeight: '700' },
});
