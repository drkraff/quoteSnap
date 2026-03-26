import { useState } from 'react';
import {
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import type { Trade } from '../../../src/api/onboarding';

interface TradeOption {
  id: Trade;
  label: string;
}

const TRADES: TradeOption[] = [
  { id: 'plumbing', label: 'Plumbing' },
  { id: 'electrical', label: 'Electrical' },
  { id: 'hvac', label: 'HVAC' },
];

interface TradeCardProps {
  trade: TradeOption;
  isSelected: boolean;
  onPress: (trade: Trade) => void;
}

function TradeCard({ trade, isSelected, onPress }: TradeCardProps): JSX.Element {
  return (
    <Pressable
      style={[styles.card, isSelected && styles.cardSelected]}
      onPress={() => onPress(trade.id)}
      accessibilityRole="button"
      accessibilityLabel={trade.label}
      accessibilityState={{ selected: isSelected }}
    >
      {isSelected && (
        <Text style={styles.checkmark}>{'\u2713'}</Text>
      )}
      <Text style={styles.cardLabel}>{trade.label}</Text>
    </Pressable>
  );
}

export default function TradeSelectionScreen(): JSX.Element {
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const router = useRouter();

  function handleTradeSelect(trade: Trade): void {
    setSelectedTrade(trade);
  }

  function handleCTAPress(): void {
    if (selectedTrade === null) return;
    router.push({
      pathname: '/(auth)/onboarding/seeding',
      params: { trade: selectedTrade },
    });
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.heading}>Choose your trade</Text>
      <Text style={styles.subheading}>We'll set up your starter catalog.</Text>
      <FlatList
        data={TRADES}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        renderItem={({ item }) => (
          <TradeCard
            trade={item}
            isSelected={selectedTrade === item.id}
            onPress={handleTradeSelect}
          />
        )}
        style={styles.list}
      />
      <TouchableOpacity
        style={[styles.cta, selectedTrade === null && styles.ctaDisabled]}
        onPress={handleCTAPress}
        disabled={selectedTrade === null}
        accessibilityRole="button"
        accessibilityLabel="Set Up My Catalog"
        accessibilityState={{ disabled: selectedTrade === null }}
      >
        <Text style={styles.ctaText}>Set Up My Catalog</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    padding: 24,
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
    marginBottom: 8,
  },
  subheading: {
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
    color: '#666',
    marginBottom: 32,
  },
  list: {
    flex: 1,
  },
  row: {
    gap: 8,
  },
  card: {
    flex: 1,
    minHeight: 44,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  cardSelected: {
    backgroundColor: '#f5f5f5',
    borderColor: '#0066cc',
    borderWidth: 2,
  },
  checkmark: {
    position: 'absolute',
    top: 4,
    right: 4,
    fontSize: 14,
    color: '#0066cc',
  },
  cardLabel: {
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
  },
  cta: {
    backgroundColor: '#0066cc',
    borderRadius: 8,
    padding: 16,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: {
    opacity: 0.5,
  },
  ctaText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
