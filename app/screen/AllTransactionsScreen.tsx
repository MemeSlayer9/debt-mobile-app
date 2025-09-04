import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
} from "react-native";
import { useRoute, useFocusEffect, useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from '@react-navigation/stack';
import { Dropdown } from "react-native-element-dropdown";
import { DatePickerModal } from "react-native-paper-dates";
import AntDesign from "@expo/vector-icons/AntDesign";
import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../supabase/supabaseClient";
import { useCurrency } from "../context/CurrencyContext";

// Local alias for CalendarDate (Date | undefined)
type CalendarDate = Date | undefined;

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

type FilterType = {
  label: string;
  value: "today" | "week" | "month" | "year" | "custom" | "all";
};

type DateRange = {
  start: CalendarDate;
  end: CalendarDate;
};

// Tab types
type TabType = "all" | "new" | "old";

// Navigation type definition
type RootStackParamList = {
  AllTransactions: { customer: Customer };
  OldTransactions: { customer: Customer };
};

export default function AllTransactionsScreen() {
  const route = useRoute();
  const { customer } = route.params as { customer: Customer };
  const { currency } = useCurrency();
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<{
    all: Transaction[];
    new: Transaction[];
    old: Transaction[];
  }>({ all: [], new: [], old: [] });
  
  const [selectedFilter, setSelectedFilter] = useState<FilterType>({
    label: "All Transactions",
    value: "all",
  });
  const [dateRange, setDateRange] = useState<DateRange>({ start: undefined, end: undefined });
  const [datePickerVisible, setDatePickerVisible] = useState(false);

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newAmount, setNewAmount] = useState("");

  const [selectedTransactions, setSelectedTransactions] = useState<string[]>([]);
  const [currentBalance, setCurrentBalance] = useState<number>(customer.balance ?? 0);
  const [isRestored, setIsRestored] = useState<boolean>(false);
  
  // New state for tab navigation
  const [activeTab, setActiveTab] = useState<TabType>("all");

  // *** Connectivity flag ***
  const [isConnected, setIsConnected] = useState<boolean>(true);

  // Queue storage key
  const QUEUE_KEY = `@txQueue_${customer.id}`;

  // Currency formatting function
  const formatCurrency = (amount: number) => {
    return amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const filters: FilterType[] = [
    { label: "Today", value: "today" },
    { label: "This Week", value: "week" },
    { label: "This Month", value: "month" },
    { label: "This Year", value: "year" },
    { label: "Custom Date", value: "custom" },
    { label: "All Transactions", value: "all" },
  ];

  // --- Helpers ---

  // Confirmation
  const confirmAsync = (title: string, message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      Alert.alert(
        title,
        message,
        [
          { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
          { text: "Proceed", onPress: () => resolve(true) },
        ],
        { cancelable: false }
      );
    });
  };

  // Date-range resolver
  const getDateRange = (type: string): DateRange => {
    const now = new Date();
    switch (type) {
      case "today":
        return {
          start: new Date(now.setHours(0, 0, 0, 0)),
          end: new Date(now.setHours(23, 59, 59, 999)),
        };
      case "week": {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        return {
          start: new Date(startOfWeek.setHours(0, 0, 0, 0)),
          end: new Date(endOfWeek.setHours(23, 59, 59, 999)),
        };
      }
      case "month":
        return {
          start: new Date(now.getFullYear(), now.getMonth(), 1),
          end: new Date(now.getFullYear(), now.getMonth() + 1, 0),
        };
      case "year":
        return {
          start: new Date(now.getFullYear(), 0, 1),
          end: new Date(now.getFullYear(), 11, 31),
        };
      default:
        return { start: undefined, end: undefined };
    }
  };

  // Fetch Supabase transactions & balance
  const fetchTransactions = async () => {
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false });
    if (!error) setTransactions(data ?? []);
  };
  
  const fetchCustomerBalance = async () => {
    const { data, error } = await supabase
      .from("customers")
      .select("balance")
      .eq("id", customer.id)
      .maybeSingle();
    if (!error && data) setCurrentBalance(data.balance ?? 0);
  };

  // Initial load & on focus
  useEffect(() => {
    fetchTransactions();
  }, [customer.id]);
  
  useFocusEffect(
    useCallback(() => {
      fetchCustomerBalance();
      fetchTransactions();
    }, [customer.id])
  );

  // Segment old vs. new for backups, deletes, etc.
  const getTransactionSegments = (txs: Transaction[]) => {
    const asc = [...txs].sort(
      (a, b) =>
        new Date(a.created_at!).getTime() -
        new Date(b.created_at!).getTime()
    );
    const segments: Transaction[][] = [];
    let curr: Transaction[] = [];
    asc.forEach((tx) => {
      curr.push(tx);
      if ((tx.balance_after ?? 0) === 0) {
        segments.push(curr);
        curr = [];
      }
    });
    if (curr.length) segments.push(curr);

    let oldTx: Transaction[] = [];
    let newTx: Transaction[] = [];
    if (segments.length) {
      const last = segments[segments.length - 1];
      if ((last[last.length - 1].balance_after ?? 0) === 0)
        oldTx = segments.flat();
      else {
        oldTx = segments.slice(0, -1).flat();
        newTx = last;
      }
    }
    return { oldTransactions: oldTx, newTransactions: newTx };
  };

  // Filter application
  const filterTransactions = () => {
    let filtered = [...transactions];
    if (selectedFilter.value !== "all") {
      const range =
        selectedFilter.value === "custom"
          ? dateRange
          : getDateRange(selectedFilter.value);
      filtered = filtered.filter((tx) => {
        if (!tx.created_at) return false;
        const d = new Date(tx.created_at);
        return (
          (!range.start || d >= range.start) &&
          (!range.end || d <= range.end)
        );
      });
    }
    
    // Split transactions into new and old categories
    const { newTransactions, oldTransactions } = getTransactionSegments(filtered);
    
    setFilteredTransactions({
      all: filtered,
      new: newTransactions,
      old: oldTransactions
    });
  };
  
  useEffect(filterTransactions, [
    transactions,
    selectedFilter,
    dateRange,
  ]);
  
  const handleFilterChange = (filter: FilterType) => {
    setSelectedFilter(filter);
    if (filter.value === "custom") setDatePickerVisible(true);
    else setDateRange(getDateRange(filter.value));
  };

  // Persist old transactions backup
  const backupOldTransactions = async () => {
    const { oldTransactions } = getTransactionSegments(transactions);
    if (oldTransactions.length) {
      await AsyncStorage.setItem(
        `@oldTxBackup_${customer.id}`,
        JSON.stringify(oldTransactions)
      );
    }
  };

  // Toggle selection for delete
  const toggleSelection = (transactionId: string) => {
    setSelectedTransactions((prev) =>
      prev.includes(transactionId)
        ? prev.filter((id) => id !== transactionId)
        : [...prev, transactionId]
    );
  };

  // Restore backup
  const restoreOldTransactions = async () => {
    const str = await AsyncStorage.getItem(
      `@oldTxBackup_${customer.id}`
    );
    if (!str) {
      Alert.alert("No Backup Found");
      return;
    }
    const oldTx: Transaction[] = JSON.parse(str);
    const ok = await confirmAsync(
      "Confirm Restore",
      "Insert old transactions?"
    );
    if (!ok) return;
    for (const tx of oldTx) {
      await supabase
        .from("transactions")
        .upsert(tx, { onConflict: "transaction_id" });
    }
    Alert.alert("Restore Complete");
    fetchTransactions();
    fetchCustomerBalance();
    setIsRestored(true);
  };

  // Delete selected transactions
// Updated function to handle delete all transactions based on active tab
const handleDeleteAll = () => {
  // Determine which transactions to delete based on active tab
  const tabName = activeTab === "all" ? "ALL" : 
                 activeTab === "new" ? "NEW" : "OLD";
  
  Alert.alert(
    `Delete ${tabName} Transactions`,
    `This will delete ${tabName === "ALL" ? "ALL" : "all " + tabName.toLowerCase()} transactions. Proceed?`,
    [
      { text: "Cancel", style: "cancel" },
      {
        text: `Delete ${tabName}`,
        style: "destructive",
        onPress: async () => {
          // Always back up before deleting
          await backupOldTransactions();
          
          // Get the IDs of transactions to delete based on active tab
          let transactionsToDelete: Transaction[] = [];
          let transactionIdsToDelete: string[] = [];
          
          if (activeTab === "all") {
            transactionsToDelete = transactions;
            transactionIdsToDelete = transactions
              .map(tx => tx.transaction_id || "")
              .filter(id => id !== "");
          } else if (activeTab === "new") {
            const { newTransactions } = getTransactionSegments(transactions);
            transactionsToDelete = newTransactions;
            transactionIdsToDelete = newTransactions
              .map(tx => tx.transaction_id || "")
              .filter(id => id !== "");
          } else if (activeTab === "old") {
            const { oldTransactions } = getTransactionSegments(transactions);
            transactionsToDelete = oldTransactions;
            transactionIdsToDelete = oldTransactions
              .map(tx => tx.transaction_id || "")
              .filter(id => id !== "");
          }
          
          // Skip if no transactions to delete
          if (transactionIdsToDelete.length === 0) {
            Alert.alert("No transactions to delete");
            return;
          }
          
          // Calculate balance adjustment (only needed for "new" transactions)
          if (activeTab === "all" || activeTab === "new") {
            // Calculate how much to restore to balance
            const { newTransactions } = getTransactionSegments(transactions);
            // If deleting all, use all new transactions
            // If deleting new only, use all new transactions
            // If deleting old only, no balance adjustment needed
            const transactionsAffectingBalance = activeTab === "old" as TabType ? [] : newTransactions;
            
            const totalToRestore = transactionsAffectingBalance.reduce(
              (sum, tx) => sum + tx.amount,
              0
            );
            
            if (totalToRestore > 0) {
              const updated = currentBalance + totalToRestore;
              await supabase
                .from("customers")
                .update({ balance: updated })
                .eq("id", customer.id);
              setCurrentBalance(updated);
            }
          }
          
          // Delete the transactions
          if (transactionIdsToDelete.length > 0) {
            await supabase
              .from("transactions")
              .delete()
              .in("transaction_id", transactionIdsToDelete);
              
            // Update UI by removing deleted transactions
            setTransactions(prev => 
              prev.filter(tx => !transactionIdsToDelete.includes(tx.transaction_id || ""))
            );
          }
          
          // Clear any selections
          setSelectedTransactions([]);
          
          Alert.alert(`${tabName} transactions deleted successfully`);
        },
      },
    ]
  );
};

// Updated function to handle deletion of selected transactions
const handleDeleteTransactions = async () => {
  if (!selectedTransactions.length) {
    Alert.alert("No transactions selected");
    return;
  }
  
  await backupOldTransactions();
  
  // Get new transactions to calculate balance adjustment
  const { newTransactions } = getTransactionSegments(transactions);
  const newIds = new Set(
    newTransactions.map((tx) => tx.transaction_id)
  );
  
  // Calculate balance adjustment for selected transactions that are in "new" category
  let balanceAdjustment = 0;
  transactions
    .filter((tx) =>
      selectedTransactions.includes(tx.transaction_id || "")
    )
    .forEach((tx) => {
      if (newIds.has(tx.transaction_id)) {
        balanceAdjustment += tx.amount;
      }
    });

  // Update customer balance if needed
  if (balanceAdjustment > 0) {
    const updated = currentBalance + balanceAdjustment;
    await supabase
      .from("customers")
      .update({ balance: updated })
      .eq("id", customer.id);
    setCurrentBalance(updated);
  }

  // Delete selected transactions
  await supabase
    .from("transactions")
    .delete()
    .in("transaction_id", selectedTransactions);
    
  // Update UI
  setTransactions((prev) =>
    prev.filter(
      (tx) => !selectedTransactions.includes(tx.transaction_id || "")
    )
  );
  setSelectedTransactions([]);
  
  Alert.alert("Selected transactions deleted successfully");
};

  // --- OFFLINE QUEUE LOGIC ---

  // Add to queue in storage
  const enqueueTransaction = async (
    tx: Omit<Transaction, "transaction_id">
  ) => {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const queue: any[] = raw ? JSON.parse(raw) : [];
    queue.push(tx);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  };

  // Add or queue a new transaction
  const handleAddTransaction = async () => {
    const amount = parseFloat(newAmount);
    if (!amount || amount <= 0) {
      Alert.alert("Invalid Amount");
      return;
    }
    if (amount > currentBalance) {
      Alert.alert("Exceeds Balance");
      return;
    }

    const txPayload: Omit<Transaction, "transaction_id"> = {
      customer_id: customer.id,
      amount,
      old_balance: currentBalance,
      balance_after: currentBalance - amount,
      created_at: (dateRange.start ?? new Date()).toISOString(),
    };

    if (!isConnected) {
      // offline: queue + optimistically update UI
      await enqueueTransaction(txPayload);
      setCurrentBalance(currentBalance - amount);
      setTransactions((prev) => [
        { ...txPayload, transaction_id: `queued-${Date.now()}` },
        ...prev,
      ]);
      setNewAmount("");
      setAddModalVisible(false);
      return;
    }

    // online: send immediately
    const { data, error } = await supabase
      .from("transactions")
      .insert([txPayload])
      .select();
    if (!error && data?.[0]) {
      await supabase
        .from("customers")
        .update({ balance: txPayload.balance_after })
        .eq("id", customer.id);
      setCurrentBalance(txPayload.balance_after ?? 0);
      setNewAmount("");
      setAddModalVisible(false);
      fetchTransactions();
    } else {
      Alert.alert("Failed to add transaction");
    }
  };

  // --- CONNECTIVITY & SYNC ---

  // Listen for changes
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setIsConnected(!!state.isConnected);
    });
    return () => unsub();
  }, []);

  // Sync queue when back online
  useEffect(() => {
    if (!isConnected) return;

    (async () => {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      if (!raw) return;
      const queue: Omit<Transaction, "transaction_id">[] =
        JSON.parse(raw);
      if (queue.length === 0) return;

      const { error } = await supabase
        .from("transactions")
        .insert(queue);
      if (!error) {
        await AsyncStorage.removeItem(QUEUE_KEY);
        fetchTransactions();
        fetchCustomerBalance();
      } else {
        console.warn("Failed to sync queued txns", error);
      }
    })();
  }, [isConnected]);

  // Calculate totals for currently visible transactions based on active tab
  const getVisibleTransactions = () => {
    switch (activeTab) {
      case "new":
        return filteredTransactions.new;
      case "old":
        return filteredTransactions.old;
      case "all":
      default:
        return filteredTransactions.all;
    }
  };
  
  const visibleTransactions = getVisibleTransactions();
  const visibleCount = visibleTransactions.length;
  const visibleAmount = visibleTransactions.reduce(
    (sum, tx) => sum + tx.amount,
    0
  );
  
  // Render individual transaction item
  const renderTransactionItem = (tx: Transaction, type: 'new' | 'old') => (
    <View key={tx.transaction_id} style={styles.transactionItem}>
      <Image
        source={{ uri: "https://via.placeholder.com/40" }}
        style={styles.avatar}
      />
      <View style={styles.transactionInfo}>
        <Text style={styles.dateText}>
          {new Date(tx.created_at!).toLocaleDateString()}
        </Text>
        <Text style={styles.amountText}>
          {currency}
          {formatCurrency(tx.amount)}
        </Text>
        <Text style={styles.balanceText}>
          {currency}
          {formatCurrency(tx.old_balance ?? 0)} -{" "}
          {currency}
          {formatCurrency(tx.amount)} ={" "}
          {currency}
          {formatCurrency((tx.old_balance ?? 0) - tx.amount)}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => toggleSelection(tx.transaction_id || "")}
      >
        <Text style={styles.checkbox}>
          {selectedTransactions.includes(tx.transaction_id || "") ? "☑" : "☐"}
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <ScrollView style={styles.container}>
      {/* Offline banner */}
      {!isConnected && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>
            You're offline — new txns will be queued.
          </Text>
        </View>
      )}

      <Text style={styles.header}>
        {currentBalance === 0
          ? "PAID"
          : `${currency}${formatCurrency(currentBalance)} Balance`}
      </Text>

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === "all" && styles.activeTab]} 
          onPress={() => setActiveTab("all")}
        >
          <Text style={[styles.tabText, activeTab === "all" && styles.activeTabText]}>
            All Transactions
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === "new" && styles.activeTab]} 
          onPress={() => setActiveTab("new")}
        >
          <Text style={[styles.tabText, activeTab === "new" && styles.activeTabText]}>
            New Transactions
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === "old" && styles.activeTab]} 
          onPress={() => setActiveTab("old")}
        >
          <Text style={[styles.tabText, activeTab === "old" && styles.activeTabText]}>
            Old Transactions
          </Text>
        </TouchableOpacity>
      </View>

      {/* Filter */}
      <View style={styles.filterContainer}>
        <Dropdown
          style={styles.dropdown}
          data={filters}
          labelField="label"
          valueField="value"
          value={selectedFilter.value}
          onChange={handleFilterChange}
          renderLeftIcon={() => (
            <AntDesign
              name="filter"
              size={20}
              color="white"
              style={styles.icon}
            />
          )}
          selectedTextStyle={styles.selectedText}
          placeholderStyle={styles.placeholderText}
          placeholder="Select Filter"
        />
        {selectedFilter.value === "custom" &&
          dateRange.start &&
          dateRange.end && (
            <Text style={styles.dateRangeText}>
              {dateRange.start.toLocaleDateString()} -{" "}
              {dateRange.end.toLocaleDateString()}
            </Text>
          )}
      </View>

      {/* Totals - Updated to show visible transaction totals */}
      <View style={styles.totalContainer}>
        <Text style={styles.totalText}>
          {activeTab === "all" ? "Total" : activeTab === "new" ? "New" : "Old"} Transactions: {visibleCount}
        </Text>
        <Text style={styles.totalText}>
          {activeTab === "all" ? "Total" : activeTab === "new" ? "New" : "Old"} Amount: {currency}
          {formatCurrency(visibleAmount)}
        </Text>
      </View>

      {/* Action Buttons */}
      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[
            styles.button,
            isConnected ? styles.addButton : styles.disabledButton,
          ]}
          onPress={() => setAddModalVisible(true)}
          disabled={!isConnected}
        >
          <Text style={styles.buttonText}>
            {isConnected ? "Add Transaction" : "Queue Transaction"}
          </Text>
        </TouchableOpacity>

        {selectedTransactions.length > 0 && (
          <TouchableOpacity
            style={[styles.button, styles.deleteButton]}
            onPress={handleDeleteTransactions}
          >
            <Text style={styles.buttonText}>Delete Selected</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.button, styles.deleteButton]}
          onPress={handleDeleteAll}
        >
          <Text style={styles.buttonText}>Delete All</Text>
        </TouchableOpacity>
      </View>

      {/* Backup & Old Transactions Navigation */}
      <View style={styles.backupRestoreContainer}>
        <TouchableOpacity
          style={[styles.button, styles.restoreButton]}
          onPress={restoreOldTransactions}
        >
          <Text style={styles.buttonText}>Restore Old Transactions</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.button, styles.viewOldButton]}
          onPress={() => navigation.navigate('OldTransactions', { customer })}
        >
          <Text style={styles.buttonText}>View All Old Transactions</Text>
        </TouchableOpacity>
      </View>

      {/* Display transactions based on active tab */}
      <View style={styles.transactionsContainer}>
        {/* New Transactions Section */}
        {(activeTab === 'all' || activeTab === 'new') && (
          <>
            {filteredTransactions.new.length > 0 && activeTab === 'all' && (
              <Text style={styles.sectionHeader}>New Transactions</Text>
            )}
            
            {filteredTransactions.new.length > 0 ? (
              filteredTransactions.new
                .slice()
                .map((tx) => renderTransactionItem(tx, 'new'))
            ) : (
              activeTab === 'new' && (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>No new transactions found</Text>
                </View>
              )
            )}
          </>
        )}
        
        {/* Old Transactions Section */}
        {(activeTab === 'all' || activeTab === 'old') && (
          <>
            {filteredTransactions.old.length > 0 && activeTab === 'all' && (
              <Text style={styles.sectionHeader}>Old Transactions</Text>
            )}
            
            {filteredTransactions.old.length > 0 ? (
              filteredTransactions.old
                .slice()
                .map((tx) => renderTransactionItem(tx, 'old'))
            ) : (
              activeTab === 'old' && (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>No old transactions found</Text>
                </View>
              )
            )}
          </>
        )}
        
        {/* Empty state for 'all' tab when no transactions */}
        {activeTab === 'all' && 
         filteredTransactions.new.length === 0 && 
         filteredTransactions.old.length === 0 && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No transactions found</Text>
          </View>
        )}
      </View>

      {/* Date Picker */}
      <DatePickerModal
        locale="en"
        mode="range"
        visible={datePickerVisible}
        onDismiss={() => setDatePickerVisible(false)}
        startDate={dateRange.start}
        endDate={dateRange.end}
        onConfirm={({ startDate, endDate }) => {
          setDateRange({ start: startDate, end: endDate });
          setDatePickerVisible(false);
        }}
      />

      {/* Add Modal */}
      <Modal visible={addModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>New Transaction</Text>
            <TextInput
              style={styles.input}
              placeholder="Amount"
              placeholderTextColor="#999"
              keyboardType="numeric"
              value={newAmount}
              onChangeText={setNewAmount}
            />
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setDatePickerVisible(true)}
            >
              <Text style={styles.dateButtonText}>
                {dateRange.start
                  ? dateRange.start.toLocaleDateString()
                  : "Select Date (Optional)"}
              </Text>
            </TouchableOpacity>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setAddModalVisible(false)}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.submitButton]}
                onPress={handleAddTransaction}
              >
                <Text style={styles.buttonText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#121212", padding: 16 },
  offlineBanner: { padding: 8, backgroundColor: "#FFA726" },
  offlineText: { color: "#FFF", textAlign: "center" },
  header: {
    color: "#FFF",
    fontSize: 24,
    fontWeight: "bold",
    marginVertical: 16,
    textAlign: "center",
  },
  subHeader: {
    color: "#FFF",
    fontSize: 20,
    fontWeight: "bold",
    marginVertical: 12,
  },
  // Tab styles
  tabContainer: {
    flexDirection: "row",
    marginBottom: 16,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#1C1F24",
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#1C1F24",
  },
  activeTab: {
    backgroundColor: "#2A2F35",
    borderBottomWidth: 2,
    borderColor: "#4CAF50",
  },
  tabText: {
    color: "#999",
    fontWeight: "500",
  },
  activeTabText: {
    color: "#FFF",
    fontWeight: "600",
  },
  filterContainer: { marginBottom: 16 },
  dropdown: {
    backgroundColor: "#2A2F35",
    borderRadius: 8,
    paddingHorizontal: 16,
    height: 50,
  },
  selectedText: { color: "#FFF", fontSize: 16 },
  placeholderText: { color: "#999", fontSize: 16 },
  icon: { marginRight: 8 },
  dateRangeText: { color: "#999", textAlign: "center", marginTop: 8 },
  totalContainer: {
    backgroundColor: "#1C1F24",
    borderRadius: 8,
    padding: 12,
    marginVertical: 12,
  },
  totalText: { color: "#FFF", fontSize: 14, marginVertical: 4 },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
    gap: 8,
  },
  backupRestoreContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
    gap: 8,
  },
  button: { flex: 1, padding: 12, borderRadius: 8, alignItems: "center" },
  addButton: { backgroundColor: "#4CAF50" },
  disabledButton: { backgroundColor: "#888" },
  deleteButton: { backgroundColor: "#F44336" },
  restoreButton: { backgroundColor: "#009688" },
  viewOldButton: { backgroundColor: "#3F51B5" },
  buttonText: { color: "#FFF", fontWeight: "600" },
  transactionItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1C1F24",
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, marginRight: 16 },
  transactionInfo: { flex: 1 },
  dateText: { color: "#999", fontSize: 12 },
  amountText: {
    color: "#4CAF50",
    fontSize: 16,
    fontWeight: "600",
    marginVertical: 4,
  },
  balanceText: { color: "#FFD700", fontSize: 12 },
  checkbox: { color: "#4CAF50", fontSize: 24, marginLeft: 8 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#1C1F24",
    width: "80%",
    borderRadius: 12,
    padding: 20,
  },
  modalTitle: {
    color: "#FFF",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
  },
  input: {
    backgroundColor: "#2A2F35",
    color: "#FFF",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  dateButton: {
    backgroundColor: "#2A2F35",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  dateButtonText: { color: "#FFF", textAlign: "center" },
  modalButtons: { flexDirection: "row", gap: 8 },
  modalButton: { flex: 1, padding: 12, borderRadius: 8, alignItems: "center" },
  cancelButton: { backgroundColor: "#F44336" },
  submitButton: { backgroundColor: "#4CAF50" },
   transactionsContainer: {
    marginBottom: 20,
  },
  sectionHeader: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "600",
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
   emptyContainer: {
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: "#999",
    fontSize: 16,
  }
});
    