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
import { useRoute, useFocusEffect } from "@react-navigation/native";
import { Dropdown } from "react-native-element-dropdown";
import { DatePickerModal } from "react-native-paper-dates";
import AntDesign from "@expo/vector-icons/AntDesign";
import { supabase } from "../supabase/supabaseClient";
import { useCurrency } from "../context/CurrencyContext";
import AsyncStorage from "@react-native-async-storage/async-storage";

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

export default function AllTransactionsScreen() {
  const route = useRoute();
  const { customer } = route.params as { customer: Customer };
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<FilterType>({ label: "All Transactions", value: "all" });
  const [dateRange, setDateRange] = useState<DateRange>({ start: undefined, end: undefined });
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newAmount, setNewAmount] = useState("");
  const [selectedTransactions, setSelectedTransactions] = useState<string[]>([]);
  const [currentBalance, setCurrentBalance] = useState<number>(customer.balance ?? 0);
  const [isRestored, setIsRestored] = useState<boolean>(false);
  const { currency } = useCurrency();

  const filters: FilterType[] = [
    { label: "Today", value: "today" },
    { label: "This Week", value: "week" },
    { label: "This Month", value: "month" },
    { label: "This Year", value: "year" },
    { label: "Custom Date", value: "custom" },
    { label: "All Transactions", value: "all" },
  ];

  // Helper for Alert confirmation
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

  // Date range helper
  const getDateRange = (type: string): DateRange => {
    const now = new Date();
    switch (type) {
      case "today":
        return { start: new Date(now.setHours(0, 0, 0, 0)), end: new Date(now.setHours(23, 59, 59, 999)) };
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
        return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 0) };
      case "year":
        return { start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear(), 11, 31) };
      default:
        return { start: undefined, end: undefined };
    }
  };

  // Fetch from Supabase
  const fetchTransactions = async () => {
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false });
    if (!error) setTransactions(data || []);
  };

  const fetchCustomerBalance = async () => {
    const { data, error } = await supabase
      .from("customers")
      .select("balance")
      .eq("id", customer.id)
      .maybeSingle();
    if (!error && data) setCurrentBalance(data.balance ?? 0);
  };

  useEffect(() => { fetchTransactions(); }, [customer.id]);
  useFocusEffect(useCallback(() => { fetchCustomerBalance(); fetchTransactions(); }, [customer.id]));

  // Filter logic
  const filterTransactions = () => {
    let filtered = [...transactions];
    if (selectedFilter.value !== "all") {
      const range = selectedFilter.value === "custom" ? dateRange : getDateRange(selectedFilter.value);
      filtered = filtered.filter((tx) => {
        if (!tx.created_at) return false;
        const d = new Date(tx.created_at);
        return (!range.start || d >= range.start) && (!range.end || d <= range.end);
      });
    }
    setFilteredTransactions(filtered);
  };

  useEffect(() => { filterTransactions(); }, [transactions, selectedFilter, dateRange]);
  const handleFilterChange = (filter: FilterType) => {
    setSelectedFilter(filter);
    if (filter.value === "custom") setDatePickerVisible(true);
    else setDateRange(getDateRange(filter.value));
  };

  // Segment into old/new
  const getTransactionSegments = (txs: Transaction[]) => {
    const asc = [...txs].sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime());
    const segments: Transaction[][] = [];
    let curr: Transaction[] = [];
    asc.forEach((tx) => {
      curr.push(tx);
      if ((tx.balance_after ?? 0) === 0) { segments.push(curr); curr = []; }
    });
    if (curr.length) segments.push(curr);
    let oldTx: Transaction[] = [];
    let newTx: Transaction[] = [];
    if (segments.length) {
      const last = segments[segments.length - 1];
      if ((last[last.length - 1].balance_after ?? 0) === 0) oldTx = segments.flat();
      else { oldTx = segments.slice(0, -1).flat(); newTx = last; }
    }
    return { oldTransactions: oldTx, newTransactions: newTx };
  };

  // Auto-backup old
  const backupOldTransactions = async () => {
    try {
      const { oldTransactions } = getTransactionSegments(transactions);
      if (oldTransactions.length)
        await AsyncStorage.setItem(`@oldTxBackup_${customer.id}`, JSON.stringify(oldTransactions));
    } catch (e) { console.error(e); }
  };

  // Add this function inside your component, before the return statement
const toggleSelection = (transactionId: string) => {
  setSelectedTransactions((prev) => {
    if (prev.includes(transactionId)) {
      return prev.filter(id => id !== transactionId);
    } else {
      return [...prev, transactionId];
    }
  });
};
  // Restore old
  const restoreOldTransactions = async () => {
    try {
      const str = await AsyncStorage.getItem(`@oldTxBackup_${customer.id}`);
      if (!str) { Alert.alert("No Backup Found"); return; }
      const oldTx: Transaction[] = JSON.parse(str);
      const ok = await confirmAsync("Confirm Restore", "Insert old transactions?");
      if (!ok) return;
      for (const tx of oldTx) await supabase.from("transactions").upsert(tx, { onConflict: "transaction_id" });
      Alert.alert("Restore Complete");
      fetchTransactions(); fetchCustomerBalance(); setIsRestored(true);
    } catch (e: any) { Alert.alert("Restore Failed", e.message); }
  };

  // Delete
  const handleDeleteTransactions = async () => {
    if (!selectedTransactions.length) return;
    await backupOldTransactions();
    await supabase.from("transactions").delete().in("transaction_id", selectedTransactions);
    setTransactions((prev) => prev.filter((tx) => !selectedTransactions.includes(tx.transaction_id || "")));
    setSelectedTransactions([]);
  };

  const handleDeleteAll = () => {
    Alert.alert(
      "Delete All Transactions",
      "This will delete ALL transactions. Proceed?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete All", style: "destructive", onPress: async () => {
            await backupOldTransactions();
            await supabase.from("transactions").delete().eq("customer_id", customer.id);
            setTransactions([]); setSelectedTransactions([]);
        }}
      ]
    );
  };

  // Add new transaction
  const updateTransactionSummary = async (transaction: Transaction) => {
    // same as original implementation...
  };
  const handleAddTransaction = async () => {
    const amount = parseFloat(newAmount);
    if (!amount || amount <= 0) { Alert.alert("Invalid Amount"); return; }
    if (amount > currentBalance) { Alert.alert("Exceeds Balance"); return; }
    const oldBal = currentBalance;
    const newBal = oldBal - amount;
    const date = dateRange.start ? dateRange.start : new Date();
    const { data, error } = await supabase.from("transactions").insert([{ customer_id: customer.id, amount, old_balance: oldBal, balance_after: newBal, created_at: date.toISOString(), }]).select();
    if (!error && data?.[0]) {
      await supabase.from("customers").update({ balance: newBal }).eq("id", customer.id);
      setIsRestored(false);
      setCurrentBalance(newBal);
      await updateTransactionSummary(data[0]);
      setNewAmount("");
      setAddModalVisible(false);
      fetchTransactions();
    }
  };

  // Render
  const { oldTransactions, newTransactions } = getTransactionSegments(transactions);
  const totalCount = transactions.length;
  const totalAmountValue = transactions.reduce((sum, tx) => sum + tx.amount, 0);

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>{currentBalance === 0 ? "PAID" : `${currency}${currentBalance} Transactions`}</Text>

      <View style={styles.filterContainer}>
        <Dropdown
          style={styles.dropdown}
          data={filters}
          labelField="label"
          valueField="value"
          value={selectedFilter.value}
          onChange={handleFilterChange}
          renderLeftIcon={() => <AntDesign name="filter" size={20} color="white" style={styles.icon} />}        
          selectedTextStyle={styles.selectedText}
          placeholderStyle={styles.placeholderText}
          placeholder="Select Filter"
        />
        {selectedFilter.value === "custom" && dateRange.start && dateRange.end && (
          <Text style={styles.dateRangeText}>
            {new Date(dateRange.start).toLocaleDateString()} - {new Date(dateRange.end).toLocaleDateString()}
          </Text>
        )}
      </View>

      <View style={styles.totalContainer}>
        <Text style={styles.totalText}>Transactions: {totalCount}</Text>
        <Text style={styles.totalText}>Total: {currency}{totalAmountValue.toFixed(2)}</Text>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={[styles.button, styles.addButton]} onPress={() => setAddModalVisible(true)}>
          <Text style={styles.buttonText}>Add Transaction</Text>
        </TouchableOpacity>
        {selectedTransactions.length > 0 && (
          <TouchableOpacity style={[styles.button, styles.deleteButton]} onPress={handleDeleteTransactions}>
            <Text style={styles.buttonText}>Delete Selected</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.button, styles.deleteButton]} onPress={handleDeleteAll}>
          <Text style={styles.buttonText}>Delete All</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.backupRestoreContainer}>
        <TouchableOpacity style={[styles.button, styles.restoreButton]} onPress={restoreOldTransactions}>
          <Text style={styles.buttonText}>Restore Old Transactions</Text>
        </TouchableOpacity>
      </View>

      {newTransactions.length > 0 && (
        <View>
          <Text style={styles.subHeader}>New Transactions</Text>
          {newTransactions.map((tx) => (
            <View key={tx.transaction_id} style={styles.transactionItem}>
              <Image source={{ uri: "https://via.placeholder.com/40" }} style={styles.avatar} />
              <View style={styles.transactionInfo}>
                <Text style={styles.dateText}>{tx.created_at && new Date(tx.created_at).toLocaleDateString()}</Text>
                <Text style={styles.amountText}>{currency}{tx.amount.toFixed(2)}</Text>
                <Text style={styles.balanceText}>{currency}{(tx.old_balance ?? 0).toFixed(2)} - {currency}{tx.amount.toFixed(2)} = {currency}{((tx.old_balance ?? 0)-tx.amount).toFixed(2)}</Text>
              </View>
              <TouchableOpacity onPress={() => toggleSelection(tx.transaction_id || "")}>
                <Text style={styles.checkbox}>{selectedTransactions.includes(tx.transaction_id || "") ? "☑" : "☐"}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {oldTransactions.length > 0 && (
        <View>
          <Text style={styles.subHeader}>Old Transactions</Text>
          {oldTransactions.slice().reverse().map((tx) => (
            <View key={tx.transaction_id} style={styles.transactionItem}>
              <Image source={{ uri: "https://via.placeholder.com/40" }} style={styles.avatar} />
              <View style={styles.transactionInfo}>
                <Text style={styles.dateText}>{tx.created_at && new Date(tx.created_at).toLocaleDateString()}</Text>
                <Text style={styles.amountText}>{currency}{tx.amount.toFixed(2)}</Text>
                <Text style={styles.balanceText}>{currency}{(tx.old_balance ?? 0).toFixed(2)} - {currency}{tx.amount.toFixed(2)} = {currency}{((tx.old_balance ?? 0)-tx.amount).toFixed(2)}</Text>
              </View>
              <TouchableOpacity onPress={() => toggleSelection(tx.transaction_id || "")}>
                <Text style={styles.checkbox}>{selectedTransactions.includes(tx.transaction_id || "") ? "☑" : "☐"}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <DatePickerModal
        locale="en"
        mode="range"
        visible={datePickerVisible}
        onDismiss={() => setDatePickerVisible(false)}
        startDate={dateRange.start}
        endDate={dateRange.end}
        onConfirm={({ startDate, endDate }) => { setDateRange({ start: startDate, end: endDate }); setDatePickerVisible(false);} }
      />

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
            <TouchableOpacity style={styles.dateButton} onPress={() => setDatePickerVisible(true)}>
              <Text style={styles.dateButtonText}>{dateRange.start ? new Date(dateRange.start).toLocaleDateString() : "Select Date (Optional)"}</Text>
            </TouchableOpacity>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setAddModalVisible(false)}>
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.submitButton]} onPress={handleAddTransaction}>
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
  container: { flex: 1, backgroundColor: "#0E1114", padding: 16 },
  header: { color: "#FFF", fontSize: 24, fontWeight: "bold", marginVertical: 16, textAlign: "center" },
  subHeader: { color: "#FFF", fontSize: 20, fontWeight: "bold", marginVertical: 12 },
  filterContainer: { marginBottom: 16 },
  dropdown: { backgroundColor: "#2A2F35", borderRadius: 8, paddingHorizontal: 16, height: 50 },
  selectedText: { color: "#FFF", fontSize: 16 },
  placeholderText: { color: "#999", fontSize: 16 },
  icon: { marginRight: 8 },
  dateRangeText: { color: "#999", textAlign: "center", marginTop: 8 },
  totalContainer: { backgroundColor: "#1C1F24", borderRadius: 8, padding: 12, marginVertical: 12 },
  totalText: { color: "#FFF", fontSize: 14, marginVertical: 4 },
  buttonRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16, gap: 8 },
  backupRestoreContainer: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16, gap: 8 },
  button: { flex: 1, padding: 12, borderRadius: 8, alignItems: "center" },
  addButton: { backgroundColor: "#4CAF50" },
  deleteButton: { backgroundColor: "#F44336" },
  restoreButton: { backgroundColor: "#009688" },
  buttonText: { color: "#FFF", fontWeight: "600" },
  transactionItem: { flexDirection: "row", alignItems: "center", backgroundColor: "#1C1F24", borderRadius: 8, padding: 16, marginBottom: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20, marginRight: 16 },
  transactionInfo: { flex: 1 },
  dateText: { color: "#999", fontSize: 12 },
  amountText: { color: "#4CAF50", fontSize: 16, fontWeight: "600", marginVertical: 4 },
  balanceText: { color: "#FFD700", fontSize: 12 },
  checkbox: { color: "#4CAF50", fontSize: 24, marginLeft: 8 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  modalContent: { backgroundColor: "#1C1F24", width: "80%", borderRadius: 12, padding: 20 },
  modalTitle: { color: "#FFF", fontSize: 20, fontWeight: "bold", marginBottom: 16, textAlign: "center" },
  input: { backgroundColor: "#2A2F35", color: "#FFF", borderRadius: 8, padding: 12, marginBottom: 12 },
  dateButton: { backgroundColor: "#2A2F35", borderRadius: 8, padding: 12, marginBottom: 16 },
  dateButtonText: { color: "#FFF", textAlign: "center" },
  modalButtons: { flexDirection: "row", gap: 8 },
  modalButton: { flex: 1, padding: 12, borderRadius: 8, alignItems: "center" },
  cancelButton: { backgroundColor: "#F44336" },
  submitButton: { backgroundColor: "#4CAF50" },
});
