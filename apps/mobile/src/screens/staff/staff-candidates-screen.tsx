import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ScreenShell } from '../../components/screen-shell';
import type { StaffCandidateListItem } from '../../features/staff-candidate-management';
import { listStaffCandidates } from '../../features/staff-candidate-management';

export function StaffCandidatesScreen({
  onOpenCandidate,
}: {
  onOpenCandidate: (candidate: StaffCandidateListItem) => void;
}) {
  const [candidates, setCandidates] = useState<StaffCandidateListItem[]>([]);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const loadCandidates = useCallback(async () => {
    setIsLoading(true);
    try {
      const rows = await listStaffCandidates();
      setCandidates(rows);
      setMessage(null);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCandidates();
  }, [loadCandidates]);

  const filteredCandidates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return candidates;
    }
    return candidates.filter((candidate) =>
      [candidate.name, candidate.email, candidate.mobile]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalizedQuery)),
    );
  }, [candidates, query]);

  return (
    <ScreenShell showBanner={false}>
      <Text style={styles.title}>Candidates</Text>
      <Text style={styles.body}>
        Select a candidate to manage visible firms and status updates.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Search name, email, or mobile"
        placeholderTextColor="#94A3B8"
        value={query}
        autoCapitalize="none"
        onChangeText={setQuery}
      />

      <Pressable style={styles.secondaryButton} onPress={() => void loadCandidates()}>
        <Text style={styles.secondaryButtonText}>{isLoading ? 'Refreshing...' : 'Refresh list'}</Text>
      </Pressable>

      {message ? <Text style={styles.error}>{message}</Text> : null}

      <View style={styles.list}>
        {isLoading ? (
          <Text style={styles.emptyText}>Loading candidates...</Text>
        ) : filteredCandidates.length === 0 ? (
          <Text style={styles.emptyText}>No candidates found.</Text>
        ) : (
          filteredCandidates.map((candidate) => (
            <Pressable
              key={candidate.id}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              onPress={() => onOpenCandidate(candidate)}
            >
              <Text style={styles.cardTitle}>{candidate.name || 'Unnamed Candidate'}</Text>
              <Text style={styles.cardText}>{candidate.email}</Text>
              <Text style={styles.cardSubtle}>{candidate.mobile}</Text>
            </Pressable>
          ))
        )}
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  body: {
    color: '#475569',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  cardPressed: {
    backgroundColor: '#F8FAFC',
  },
  cardSubtle: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 4,
  },
  cardText: {
    color: '#334155',
    marginTop: 2,
  },
  cardTitle: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '700',
  },
  emptyText: {
    color: '#64748B',
    padding: 12,
    textAlign: 'center',
  },
  error: {
    color: '#B91C1C',
    fontSize: 13,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderRadius: 10,
    borderWidth: 1,
    color: '#0F172A',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  list: {
    gap: 10,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    padding: 10,
  },
  secondaryButtonText: {
    color: '#0F172A',
    fontWeight: '600',
  },
  title: {
    color: '#0F172A',
    fontSize: 24,
    fontWeight: '700',
  },
});
