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
} from "react-native";
import { useRoute, useFocusEffect } from "@react-navigation/native";
import { Dropdown } from "react-native-element-dropdown";
import { DatePickerModal } from "react-native-paper-dates";
import AntDesign from "@expo/vector-icons/AntDesign";
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

export default function TransactionsScreen() {
  const route = useRoute();
  const { customer } = route.params as { customer: Customer };
  const { currency } = useCurrency();

  // Transactions state
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [oldTransactions, setOldTransactions] = useState<Transaction[]>([]);
  const [newTransactions, setNewTransactions] = useState<Transaction[]>([]);
  
  // UI state
  const [filteredTransactions, setFilteredTransactions] = useState<{
    old: Transaction[];
    new: Transaction[];
  }>({ old: [], new: [] });
  
  const [activeTab, setActiveTab] = useState<'all' | 'new' | 'old'>('all');
  const [selectedFilter, setSelectedFilter] = useState<FilterType>({
    label: "All Transactions",
    value: "all",
  });
  const [dateRange, setDateRange] = useState<DateRange>({ start: undefined, end: undefined });
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [selectedTransactions, setSelectedTransactions] = useState<string[]>([]);
  const [isRestored, setIsRestored] = useState<boolean>(false);

  const filters: FilterType[] = [
    { label: "Today", value: "today" },
    { label: "This Week", value: "week" },
    { label: "This Month", value: "month" },
    { label: "This Year", value: "year" },
    { label: "Custom Date", value: "custom" },
    { label: "All Transactions", value: "all" },
  ];

  // --- Helpers ---
  
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

  // Fetch all transactions
  const fetchTransactions = async () => {
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false });
    
    if (!error && data) {
      setAllTransactions(data);
      
      // Process transactions into old and new
      const { oldTxs, newTxs } = segregateTransactions(data);
      setOldTransactions(oldTxs);
      setNewTransactions(newTxs);
    }
  };

  // Segregate transactions into old and new
  const segregateTransactions = (transactions: Transaction[]) => {
    // Sort by timestamp ascending
    const asc = [...transactions].sort(
      (a, b) => 
        new Date(a.created_at!).getTime() - 
        new Date(b.created_at!).getTime()
    );
    
    const segments: Transaction[][] = [];
    let curr: Transaction[] = [];
    
    // Group transactions by zero-balance segments
    asc.forEach((tx) => {
      curr.push(tx);
      if ((tx.balance_after ?? 0) === 0) {
        segments.push(curr);
        curr = [];
      }
    });
    
    if (curr.length) segments.push(curr);
    
    // "Old" transactions are all completed payment cycles
    let oldTxs: Transaction[] = [];
    let newTxs: Transaction[] = [];
    
    if (segments.length > 1) {
      // All segments except the last one (if the last one isn't completed)
      const last = segments[segments.length - 1];
      if ((last[last.length - 1].balance_after ?? 0) === 0) {
        oldTxs = segments.flat();
        newTxs = [];
      } else {
        oldTxs = segments.slice(0, -1).flat();
        newTxs = last;
      }
    } else if (segments.length === 1) {
      // If we only have one segment
      const segment = segments[0];
      if ((segment[segment.length - 1].balance_after ?? 0) === 0) {
        oldTxs = segment;
        newTxs = [];
      } else {
        oldTxs = [];
        newTxs = segment;
      }
    }
    
    return { oldTxs, newTxs };
  };

  // Initial load & on focus
  useEffect(() => {
    fetchTransactions();
  }, [customer.id]);
  
  useFocusEffect(
    useCallback(() => {
      fetchTransactions();
    }, [customer.id])
  );

  // Filter application
  const filterTransactions = () => {
    // Filter old transactions
    let filteredOld = [...oldTransactions];
    let filteredNew = [...newTransactions];
    
    if (selectedFilter.value !== "all") {
      const range =
        selectedFilter.value === "custom"
          ? dateRange
          : getDateRange(selectedFilter.value);
          
      // Apply filter to old transactions
      filteredOld = filteredOld.filter((tx) => {
        if (!tx.created_at) return false;
        const d = new Date(tx.created_at);
        return (
          (!range.start || d >= range.start) &&
          (!range.end || d <= range.end)
        );
      });
      
      // Apply same filter to new transactions
      filteredNew = filteredNew.filter((tx) => {
        if (!tx.created_at) return false;
        const d = new Date(tx.created_at);
        return (
          (!range.start || d >= range.start) &&
          (!range.end || d <= range.end)
        );
      });
    }
    
    setFilteredTransactions({
      old: filteredOld,
      new: filteredNew
    });
  };
  
  useEffect(() => {
    filterTransactions();
  }, [oldTransactions, newTransactions, selectedFilter, dateRange]);
  
  const handleFilterChange = (filter: FilterType) => {
    setSelectedFilter(filter);
    if (filter.value === "custom") setDatePickerVisible(true);
    else setDateRange(getDateRange(filter.value));
  };

  // Toggle selection
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
    
    Alert.alert(
      "Confirm Restore",
      "Insert old transactions?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Proceed", 
          onPress: async () => {
            const oldTx: Transaction[] = JSON.parse(str);
            for (const tx of oldTx) {
              await supabase
                .from("transactions")
                .upsert(tx, { onConflict: "transaction_id" });
            }
            Alert.alert("Restore Complete");
            fetchTransactions();
            setIsRestored(true);
          }
        },
      ],
      { cancelable: false }
    );
  };

  // Calculate totals for different transaction types
  const totals = {
    all: {
      count: filteredTransactions.old.length + filteredTransactions.new.length,
      amount: [...filteredTransactions.old, ...filteredTransactions.new]
        .reduce((sum, tx) => sum + tx.amount, 0)
    },
    old: {
      count: filteredTransactions.old.length,
      amount: filteredTransactions.old.reduce((sum, tx) => sum + tx.amount, 0)
    },
    new: {
      count: filteredTransactions.new.length,
      amount: filteredTransactions.new.reduce((sum, tx) => sum + tx.amount, 0)
    }
  };

  // Get current balance
  const currentBalance = newTransactions.length > 0 
    ? newTransactions[0].balance_after ?? 0 
    : 0;

  // Render a transaction item
  const renderTransactionItem = (tx: Transaction, type: 'old' | 'new') => (
    <View key={tx.transaction_id} style={[
      styles.transactionItem,
      type === 'new' ? styles.newTransactionItem : {}
    ]}>
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
          {tx.amount.toFixed(2)}
        </Text>
        <Text style={styles.balanceText}>
          {currency}
          {(tx.old_balance ?? 0).toFixed(2)} -{" "}
          {currency}
          {tx.amount.toFixed(2)} ={" "}
          {currency}
          {((tx.old_balance ?? 0) - tx.amount).toFixed(2)}
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
      <Text style={styles.header}>Customer Transactions</Text>
      
      {/* Customer Info Banner */}
      <View style={styles.customerBanner}>
        <Text style={styles.customerName}>{customer.name}</Text>
        <Text style={styles.customerBalance}>
          Current Balance: {currency}{currentBalance.toFixed(2)}
        </Text>
      </View>
      
      {/* Tab Selector */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'all' && styles.activeTab]}
          onPress={() => setActiveTab('all')}
        >
          <Text style={[styles.tabText, activeTab === 'all' && styles.activeTabText]}>
            All ({totals.all.count})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'new' && styles.activeTab]}
          onPress={() => setActiveTab('new')}
        >
          <Text style={[styles.tabText, activeTab === 'new' && styles.activeTabText]}>
            New ({totals.new.count})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'old' && styles.activeTab]}
          onPress={() => setActiveTab('old')}
        >
          <Text style={[styles.tabText, activeTab === 'old' && styles.activeTabText]}>
            Old ({totals.old.count})
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

      {/* Totals */}
      <View style={styles.totalContainer}>
        {activeTab === 'all' && (
          <>
            <Text style={styles.totalText}>
              All Transactions: {totals.all.count}
            </Text>
            <Text style={styles.totalText}>
              Total: {currency}{totals.all.amount.toFixed(2)}
            </Text>
          </>
        )}
        
        {activeTab === 'new' && (
          <>
            <Text style={styles.totalText}>
              New Transactions: {totals.new.count}
            </Text>
            <Text style={styles.totalText}>
              Total: {currency}{totals.new.amount.toFixed(2)}
            </Text>
          </>
        )}
        
        {activeTab === 'old' && (
          <>
            <Text style={styles.totalText}>
              Old Transactions: {totals.old.count}
            </Text>
            <Text style={styles.totalText}>
              Total: {currency}{totals.old.amount.toFixed(2)}
            </Text>
          </>
        )}
      </View>

      {/* Restore Button - Only show in Old tab */}
      {activeTab === 'old' && (
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, styles.restoreButton]}
            onPress={restoreOldTransactions}
          >
            <Text style={styles.buttonText}>Restore Old Transactions</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Transactions List */}
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
                .reverse()
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
                .reverse()
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: "#0E1114", 
    padding: 16 
  },
  header: {
    color: "#FFF",
    fontSize: 24,
    fontWeight: "bold",
    marginVertical: 16,
    textAlign: "center",
  },
  customerBanner: {
    backgroundColor: "#272B33",
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    alignItems: "center",
  },
  customerName: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "bold",
  },
  customerBalance: {
    color: "#4CAF50",
    fontSize: 16,
    marginTop: 4,
  },
  tabContainer: {
    flexDirection: "row",
    marginBottom: 16,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#1C1F24",
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  activeTab: {
    backgroundColor: "#272B33",
  },
  tabText: {
    color: "#999",
    fontWeight: "500",
  },
  activeTabText: {
    color: "#FFF",
  },
  filterContainer: { 
    marginBottom: 16 
  },
  dropdown: {
    backgroundColor: "#2A2F35",
    borderRadius: 8,
    paddingHorizontal: 16,
    height: 50,
  },
  selectedText: { 
    color: "#FFF", 
    fontSize: 16 
  },
  placeholderText: { 
    color: "#999", 
    fontSize: 16 
  },
  icon: { 
    marginRight: 8 
  },
  dateRangeText: { 
    color: "#999", 
    textAlign: "center", 
    marginTop: 8 
  },
  totalContainer: {
    backgroundColor: "#1C1F24",
    borderRadius: 8,
    padding: 12,
    marginVertical: 12,
  },
  totalText: { 
    color: "#FFF", 
    fontSize: 14, 
    marginVertical: 4 
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
    gap: 8,
  },
  button: { 
    flex: 1, 
    padding: 12, 
    borderRadius: 8, 
    alignItems: "center" 
  },
  restoreButton: { 
    backgroundColor: "#009688" 
  },
  buttonText: { 
    color: "#FFF", 
    fontWeight: "600" 
  },
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
  transactionItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1C1F24",
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
  },
  newTransactionItem: {
    borderLeftWidth: 4,
    borderLeftColor: "#4CAF50",
  },
  avatar: { 
    width: 40, 
    height: 40, 
    borderRadius: 20, 
    marginRight: 16 
  },
  transactionInfo: { 
    flex: 1 
  },
  dateText: { 
    color: "#999", 
    fontSize: 12 
  },
  amountText: {
    color: "#4CAF50",
    fontSize: 16,
    fontWeight: "600",
    marginVertical: 4,
  },
  balanceText: { 
    color: "#FFD700", 
    fontSize: 12 
  },
  checkbox: { 
    color: "#4CAF50", 
    fontSize: 24, 
    marginLeft: 8 
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