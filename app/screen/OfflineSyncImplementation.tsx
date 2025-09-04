import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, Alert } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../supabase/supabaseClient";

// Data models
type Customer = {
  id: number;
  name: string;
  email: string;
  phone: string;
  balance: number | null;
  due: number;
  date: string;
};

type Transaction = {
  transaction_id?: string;
  customer_id?: number;
  amount: number;
  created_at?: string;
  old_balance?: number | null;
  balance_after?: number | null;
};

type PendingTransaction = Transaction & {
  type: 'add' | 'delete';
  pendingId: string;
};

interface OfflineSyncProviderProps {
  children: React.ReactNode;
}

// Create a context for offline sync
export const OfflineSyncContext = React.createContext<{
  isOnline: boolean;
  pendingTransactionsCount: number;
  syncPendingTransactions: () => Promise<void>;
  addOfflineTransaction: (transaction: Transaction, customer: Customer) => Promise<void>;
  deleteOfflineTransaction: (transactionId: string, customer: Customer) => Promise<void>;
  deleteAllOfflineTransactions: (customer: Customer) => Promise<void>;
}>({
  isOnline: true,
  pendingTransactionsCount: 0,
  syncPendingTransactions: async () => {},
  addOfflineTransaction: async () => {},
  deleteOfflineTransaction: async () => {},
  deleteAllOfflineTransactions: async () => {}
});

export const useOfflineSync = () => React.useContext(OfflineSyncContext);

export const OfflineSyncProvider: React.FC<OfflineSyncProviderProps> = ({ children }) => {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [pendingTransactions, setPendingTransactions] = useState<PendingTransaction[]>([]);

  // Load pending transactions from AsyncStorage
  const loadPendingTransactions = async () => {
    try {
      const storedTransactions = await AsyncStorage.getItem('@pendingTransactions');
      if (storedTransactions) {
        setPendingTransactions(JSON.parse(storedTransactions));
      }
    } catch (error) {
      console.error('Failed to load pending transactions', error);
    }
  };

  // Save pending transactions to AsyncStorage
  const savePendingTransactions = async (transactions: PendingTransaction[]) => {
    try {
      await AsyncStorage.setItem('@pendingTransactions', JSON.stringify(transactions));
      setPendingTransactions(transactions);
    } catch (error) {
      console.error('Failed to save pending transactions', error);
    }
  };

  // Monitor network state
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected !== null ? state.isConnected : false);
    });

    // Initial loading of pending transactions
    loadPendingTransactions();

    return () => {
      unsubscribe();
    };
  }, []);

  // Automatic sync when coming back online
  useEffect(() => {
    if (isOnline && pendingTransactions.length > 0) {
      syncPendingTransactions();
    }
  }, [isOnline]);

  // Sync pending transactions with the server
  const syncPendingTransactions = async () => {
    if (!isOnline) {
      Alert.alert('No Internet Connection', 'Please connect to the internet to sync transactions.');
      return;
    }

    if (pendingTransactions.length === 0) {
      return;
    }

    const tempTransactions = [...pendingTransactions];
    const failedTransactions: PendingTransaction[] = [];

    for (const pendingTx of tempTransactions) {
      try {
        if (pendingTx.type === 'add') {
          // Add transaction to server
          const { data, error } = await supabase
            .from("transactions")
            .insert([{
              customer_id: pendingTx.customer_id,
              amount: pendingTx.amount,
              old_balance: pendingTx.old_balance,
              balance_after: pendingTx.balance_after,
              created_at: pendingTx.created_at
            }])
            .select();

          if (error) throw error;

          // Update customer balance
          if (pendingTx.balance_after !== undefined) {
            await supabase
              .from("customers")
              .update({ balance: pendingTx.balance_after })
              .eq("id", pendingTx.customer_id);
          }
        } else if (pendingTx.type === 'delete' && pendingTx.transaction_id) {
          // Delete transaction from server
          const { error } = await supabase
            .from("transactions")
            .delete()
            .eq("transaction_id", pendingTx.transaction_id);

          if (error) throw error;

          // Update customer balance if needed
          if (pendingTx.balance_after !== undefined && pendingTx.customer_id) {
            await supabase
              .from("customers")
              .update({ balance: pendingTx.balance_after })
              .eq("id", pendingTx.customer_id);
          }
        }
      } catch (error) {
        console.error('Failed to sync transaction', error);
        failedTransactions.push(pendingTx);
      }
    }

    // Update pending transactions with only the failed ones
    await savePendingTransactions(failedTransactions);

    if (failedTransactions.length === 0) {
      Alert.alert('Sync Complete', 'All transactions have been synchronized successfully.');
    } else {
      Alert.alert('Sync Incomplete', `${failedTransactions.length} transactions failed to sync. Will retry later.`);
    }
  };

  // Add transaction while offline
  const addOfflineTransaction = async (transaction: Transaction, customer: Customer) => {
    if (isOnline) {
      // If online, directly use the server
      try {
        const oldBal = customer.balance ?? 0;
        const newBal = oldBal - transaction.amount;
        
        const { data, error } = await supabase
          .from("transactions")
          .insert([{
            customer_id: customer.id,
            amount: transaction.amount,
            old_balance: oldBal,
            balance_after: newBal,
            created_at: transaction.created_at || new Date().toISOString()
          }])
          .select();

        if (error) throw error;

        await supabase
          .from("customers")
          .update({ balance: newBal })
          .eq("id", customer.id);

        return;
      } catch (error) {
        console.error('Failed to add transaction online, falling back to offline', error);
        // Fall back to offline mode if server call fails
      }
    }

    // Add to pending transactions for offline handling
    const oldBal = customer.balance ?? 0;
    const newBal = oldBal - transaction.amount;
    
    const pendingTransaction: PendingTransaction = {
      ...transaction,
      customer_id: customer.id,
      old_balance: oldBal,
      balance_after: newBal,
      created_at: transaction.created_at || new Date().toISOString(),
      type: 'add',
      pendingId: `pending_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    const updatedPendingTransactions = [...pendingTransactions, pendingTransaction];
    await savePendingTransactions(updatedPendingTransactions);

    // Also update local customer balance
    await AsyncStorage.setItem(`@customerBalance_${customer.id}`, JSON.stringify(newBal));

    Alert.alert(
      'Transaction Saved Offline',
      'This transaction will be synchronized when you connect to the internet.'
    );
  };

  // Delete transaction while offline
  const deleteOfflineTransaction = async (transactionId: string, customer: Customer) => {
    if (isOnline) {
      // If online, directly use the server
      try {
        // Get the transaction first to calculate balance adjustment
        const { data: txData } = await supabase
          .from("transactions")
          .select("*")
          .eq("transaction_id", transactionId)
          .single();

        if (txData) {
          // Adjust balance if necessary
          const currentBalance = customer.balance ?? 0;
          const updatedBalance = currentBalance + txData.amount;

          // Delete transaction
          await supabase
            .from("transactions")
            .delete()
            .eq("transaction_id", transactionId);

          // Update customer balance
          await supabase
            .from("customers")
            .update({ balance: updatedBalance })
            .eq("id", customer.id);
        }

        return;
      } catch (error) {
        console.error('Failed to delete transaction online, falling back to offline', error);
        // Fall back to offline mode if server call fails
      }
    }

    // Find the transaction in pending adds to remove it
    let updatedPendingTransactions = pendingTransactions.filter(
      tx => !(tx.type === 'add' && tx.pendingId === transactionId)
    );

    // If it was an offline-created transaction, we're done
    if (updatedPendingTransactions.length < pendingTransactions.length) {
      await savePendingTransactions(updatedPendingTransactions);
      
      // Update local customer balance
      const balanceStr = await AsyncStorage.getItem(`@customerBalance_${customer.id}`);
      const oldBalance = balanceStr ? JSON.parse(balanceStr) : customer.balance;
      const txToDelete = pendingTransactions.find(tx => tx.pendingId === transactionId);
      if (txToDelete) {
        const newBalance = (oldBalance || 0) + txToDelete.amount;
        await AsyncStorage.setItem(`@customerBalance_${customer.id}`, JSON.stringify(newBalance));
      }
      
      return;
    }

    // Otherwise, it's a server transaction that needs to be deleted when online
    // First find the transaction in local cache to get amount
    const localTransactions = await AsyncStorage.getItem(`@customerTransactions_${customer.id}`);
    let txAmount = 0;
    if (localTransactions) {
      const parsedTransactions = JSON.parse(localTransactions);
      const transaction = parsedTransactions.find((tx: Transaction) => tx.transaction_id === transactionId);
      if (transaction) {
        txAmount = transaction.amount;
      }
    }

    // Add the delete operation to pending transactions
    const currentBalance = customer.balance ?? 0;
    const updatedBalance = currentBalance + txAmount;
    
    const pendingDeleteTransaction: PendingTransaction = {
      transaction_id: transactionId,
      customer_id: customer.id,
      amount: txAmount,
      balance_after: updatedBalance,
      type: 'delete',
      pendingId: `pending_delete_${Date.now()}`
    };

    updatedPendingTransactions = [...updatedPendingTransactions, pendingDeleteTransaction];
    await savePendingTransactions(updatedPendingTransactions);

    // Update local customer balance
    await AsyncStorage.setItem(`@customerBalance_${customer.id}`, JSON.stringify(updatedBalance));

    Alert.alert(
      'Delete Saved Offline',
      'This deletion will be synchronized when you connect to the internet.'
    );
  };

  // Delete all transactions for a customer while offline
  const deleteAllOfflineTransactions = async (customer: Customer) => {
    if (isOnline) {
      // If online, directly use the server
      try {
        // Get all customer transactions
        const { data: transactions } = await supabase
          .from("transactions")
          .select("*")
          .eq("customer_id", customer.id);

        // Delete all transactions
        await supabase
          .from("transactions")
          .delete()
          .eq("customer_id", customer.id);

        // Reset customer balance
        await supabase
          .from("customers")
          .update({ balance: 0 })
          .eq("id", customer.id);

        return;
      } catch (error) {
        console.error('Failed to delete all transactions online, falling back to offline', error);
        // Fall back to offline mode if server call fails
      }
    }

    // Remove any pending add transactions for this customer
    const updatedPendingTransactions = pendingTransactions.filter(
      tx => !(tx.type === 'add' && tx.customer_id === customer.id)
    );

    // Add a marker to delete all transactions when online
    const pendingDeleteAllTransaction: PendingTransaction = {
      customer_id: customer.id,
      amount: 0,
      balance_after: 0,
      type: 'delete',
      pendingId: `pending_delete_all_${Date.now()}`
    };

    await savePendingTransactions([...updatedPendingTransactions, pendingDeleteAllTransaction]);

    // Update local customer balance
    await AsyncStorage.setItem(`@customerBalance_${customer.id}`, JSON.stringify(0));

    Alert.alert(
      'Delete All Saved Offline',
      'All transactions will be deleted when you connect to the internet.'
    );
  };

  return (
    <OfflineSyncContext.Provider
      value={{
        isOnline,
        pendingTransactionsCount: pendingTransactions.length,
        syncPendingTransactions,
        addOfflineTransaction,
        deleteOfflineTransaction,
        deleteAllOfflineTransactions
      }}
    >
      {children}
      {!isOnline && pendingTransactions.length > 0 && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>
            Offline Mode - {pendingTransactions.length} transaction{pendingTransactions.length !== 1 ? 's' : ''} pending sync
          </Text>
        </View>
      )}
    </OfflineSyncContext.Provider>
  );
};

const styles = StyleSheet.create({
  offlineBanner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#F44336',
    padding: 8,
    alignItems: 'center'
  },
  offlineText: {
    color: '#FFFFFF',
    fontWeight: 'bold'
  }
});