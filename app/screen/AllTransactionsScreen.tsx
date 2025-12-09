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
  backup_id?: string;
  type?: string; // ADD THIS LINE
  description?: string; // ADD THIS TOO (for balance_add descriptions)
};


type FilterType = {
  label: string;
  value: "today" | "week" | "month" | "year" | "custom" | "all";
};

type SortType = {
  label: string;
  value: "newest" | "oldest";
};

type DateRange = {
  start: CalendarDate;
  end: CalendarDate;
};

// Tab types - ONLY NEW AND OLD
type TabType = "new" | "old";

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
    new: Transaction[];
    old: Transaction[];
  }>({ new: [], old: [] });
  
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
  
  // New state for tab navigation - DEFAULT TO "NEW"
  const [activeTab, setActiveTab] = useState<TabType>("new");
  
  // State for segment selection (replaces previous balance selection)
  const [oldSegmentsList, setOldSegmentsList] = useState<{
    id: string;
    previousBalance: number;
    transactions: Transaction[];
    timestamp: string;
  }[]>([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [segmentDropdownData, setSegmentDropdownData] = useState<{label: string, value: string}[]>([]);

  // Sort functionality state
  const [selectedSort, setSelectedSort] = useState<"newest" | "oldest">("newest");
  const [showSortDropdown, setShowSortDropdown] = useState(false);

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

  const sortOptions: SortType[] = [
    { label: "Newest Date", value: "newest" },
    { label: "Oldest Date", value: "oldest" },
  ];

  const getSelectedSortLabel = () => {
    const selectedSortObj = sortOptions.find(sort => sort.value === selectedSort);
    return selectedSortObj ? selectedSortObj.label : "Newest First";
  };

  const handleSortPress = (sortValue: "newest" | "oldest") => {
    setSelectedSort(sortValue);
    setShowSortDropdown(false);
  };

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

  // Sort transactions helper
  const sortTransactions = (txs: Transaction[]): Transaction[] => {
    return [...txs].sort((a, b) => {
      const dateA = new Date(a.created_at!).getTime();
      const dateB = new Date(b.created_at!).getTime();
      return selectedSort === "newest" ? dateB - dateA : dateA - dateB;
    });
  };

  const getRestoredBackupIds = async (): Promise<string[]> => {
    const str = await AsyncStorage.getItem(`@restoredBackups_${customer.id}`);
    return str ? JSON.parse(str) : [];
  };

  // Mark a backup ID as restored
  const markBackupAsRestored = async (backupId: string) => {
    const restored = await getRestoredBackupIds();
    if (!restored.includes(backupId)) {
      restored.push(backupId);
      await AsyncStorage.setItem(
        `@restoredBackups_${customer.id}`,
        JSON.stringify(restored)
      );
    }
  };

  // Helper function to perform the actual backup and delete
  const performBackupAndDelete = async (
    backupId: string,
    transactionsToBackup: Transaction[],
    transactionIdsToDelete: string[],
    tabName: string
  ) => {
    const backupData = {
      id: backupId,
      timestamp: new Date().toISOString(),
      transactions: transactionsToBackup,
      totalAmount: transactionsToBackup.reduce((sum, tx) => sum + tx.amount, 0),
      restored: false
    };
    
    await AsyncStorage.setItem(
      `@oldTxBackup_${customer.id}_${backupId}`,
      JSON.stringify(backupData)
    );
    
    await AsyncStorage.setItem(
      `@latestBackupId_${customer.id}`,
      backupId
    );
    
    await supabase
      .from("transactions")
      .delete()
      .in("transaction_id", transactionIdsToDelete);
      
    setTransactions(prev => 
      prev.filter(tx => !transactionIdsToDelete.includes(tx.transaction_id || ""))
    );
    
    setSelectedTransactions([]);
    
    Alert.alert(
      "Success",
      `${tabName} transactions deleted and backed up. Balance unchanged. Use "Restore Old Transactions" to recover them.`
    );
  };

  // Fetch Supabase transactions & balance
const fetchTransactions = async () => {
  try {
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false });
    
    if (error) {
      console.error("Error fetching transactions:", error);
    } else {
      console.log("=== FETCHED DATA ===");
      console.log("Fetched transactions count:", data?.length || 0);
      if (data && data.length > 0) {
        console.log("First transaction:", JSON.stringify(data[0], null, 2));
        console.log("old_balance:", data[0].old_balance);
        console.log("balance_after:", data[0].balance_after);
      }
      setTransactions(data ?? []);
    }
  } catch (error) {
    console.error("Exception fetching transactions:", error);
  }
};

const fetchCustomerBalance = async () => {
  try {
    const { data, error } = await supabase
      .from("customers")
      .select("balance")
      .eq("id", customer.id)
      .maybeSingle();
    
    if (error) {
      console.error("Error fetching balance:", error);
    } else if (data) {
      console.log("Fetched balance from DB:", data.balance);
      setCurrentBalance(data.balance ?? 0);
    }
  } catch (error) {
    console.error("Exception fetching balance:", error);
  }
};

  // Initial load & on focus
 
  
  useFocusEffect(
    useCallback(() => {
      fetchCustomerBalance();
      fetchTransactions();
    }, [customer.id])
  );

  // Segment old vs. new for backups, deletes, etc.
const getTransactionSegments = (txs: Transaction[]) => {
  console.log("=== SEGMENTATION DEBUG ===");
  console.log("Input transactions:", txs.length);
  
  // FILTER OUT balance_add transactions HERE TOO!
  const realTransactions = txs.filter(tx => tx.type !== 'balance_add');
  console.log("After filtering balance_add:", realTransactions.length);
  
  if (realTransactions.length === 0) {
    return { 
      oldTransactions: [], 
      newTransactions: [], 
      oldSegments: [] 
    };
  }
  
  // Sort by created_at ascending (oldest first)
  const asc = [...realTransactions].sort(
    (a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime()
  );
  
  console.log("Sorted transactions:", asc.length);
  
  const segments: Transaction[][] = [];
  let curr: Transaction[] = [];
  
  asc.forEach((tx, index) => {
    console.log(`TX ${index}:`, {
      id: tx.transaction_id,
      old_balance: tx.old_balance,
      amount: tx.amount,
      balance_after: tx.balance_after,
      created_at: tx.created_at
    });
    
    curr.push(tx);
    
    // Check if this transaction resulted in balance = 0 (PAID)
    if (tx.balance_after === 0 || tx.balance_after === null) {
      console.log(`  -> Segment END detected at TX ${index} (balance_after = ${tx.balance_after})`);
      segments.push([...curr]);
      curr = [];
    }
  });
  
  // If there are remaining transactions (current unpaid balance)
  if (curr.length > 0) {
    console.log("Adding remaining transactions as NEW segment:", curr.length);
    segments.push(curr);
  }
  
  console.log("Total segments created:", segments.length);

  let oldTx: Transaction[] = [];
  let newTx: Transaction[] = [];
  let oldSegments: Transaction[][] = [];
  
  if (segments.length === 0) {
    return { oldTransactions: [], newTransactions: [], oldSegments: [] };
  }
  
  // Check the last segment
  const lastSegment = segments[segments.length - 1];
  const lastTxInLastSegment = lastSegment[lastSegment.length - 1];
  
  console.log("Last segment last transaction balance_after:", lastTxInLastSegment.balance_after);
  
  // If last segment ends with balance = 0, ALL segments are old (fully paid)
  if (lastTxInLastSegment.balance_after === 0 || lastTxInLastSegment.balance_after === null) {
    oldSegments = segments;
    oldTx = segments.flat();
    console.log("All segments are OLD (all paid off)");
  } else {
    // Last segment has balance > 0, so it's NEW
    // All previous segments are OLD
    oldSegments = segments.slice(0, -1);
    oldTx = oldSegments.flat();
    newTx = lastSegment;
    console.log(`Last segment is NEW (${newTx.length} txs), previous ${oldSegments.length} segments are OLD (${oldTx.length} txs)`);
  }
  
  return { oldTransactions: oldTx, newTransactions: newTx, oldSegments };
};

   const getAllOldSegments = () => {
    const { oldSegments } = getTransactionSegments(transactions);
    console.log("Getting all old segments:", oldSegments.length);
    
    return oldSegments.map((segment, index) => {
      if (segment.length === 0) return null;
      
      const firstTx = segment[0];
      const lastTx = segment[segment.length - 1];
      
      // Calculate the ORIGINAL starting balance by adding up ALL transaction amounts
      // This gives us the balance BEFORE any deductions were made (the 500 you want)
      const totalTransactionAmount = segment.reduce((sum, tx) => sum + tx.amount, 0);
      const originalStartingBalance = totalTransactionAmount;
      
      // Create unique ID for this segment using first transaction ID or timestamp
      const segmentId = firstTx?.transaction_id || `segment_${index}_${firstTx?.created_at}`;
      
      console.log(`Segment ${index}:`, {
        id: segmentId,
        originalStartingBalance,
        totalTransactionAmount,
        transactions: segment.length,
        date: firstTx?.created_at,
        firstTxOldBalance: firstTx?.old_balance
      });
      
      return {
        id: segmentId,
        previousBalance: originalStartingBalance, // This is the sum of all transactions (always 500)
        transactions: segment,
        timestamp: lastTx?.created_at || firstTx?.created_at || new Date().toISOString()
      };
    }).filter(seg => seg !== null) as {
      id: string;
      previousBalance: number;
      transactions: Transaction[];
      timestamp: string;
    }[];
  };

  // Get transactions for a specific segment by ID
  const getTransactionsForSegment = (segmentId: string) => {
    const allSegments = getAllOldSegments();
    console.log("Looking for segment with ID:", segmentId);
    console.log("Available segments:", allSegments.length);
    
    const segment = allSegments.find(seg => seg.id === segmentId);
    
    if (!segment) {
      console.log("Segment not found!");
      return [];
    }
    
    console.log("Found segment with", segment.transactions.length, "transactions");
    return segment.transactions;
  };

  const calculateBalanceAfter = (tx: Transaction, index: number, allTxs: Transaction[]) => {
    // If balance_after exists and is valid, use it
    if (tx.balance_after !== null && tx.balance_after !== undefined) {
      return tx.balance_after;
    }
    
    // Otherwise calculate it
    return (tx.old_balance ?? 0) - tx.amount;
  };

  // Filter application
const filterTransactions = () => {
  // FILTER OUT balance_add transactions - we don't want to see them!
  let filtered = transactions.filter(tx => tx.type !== 'balance_add');
  
  // Ensure all transactions have balance_after calculated
  filtered = filtered.map((tx, index, arr) => ({
    ...tx,
    balance_after: tx.balance_after ?? ((tx.old_balance ?? 0) - tx.amount)
  }));
  
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
  
  // Update old segments list for dropdown
  const allSegments = getAllOldSegments();
  setOldSegmentsList(allSegments);
  
  // Create dropdown data for segments
const dropdownData = allSegments.map((segment, index) => ({
  label: `${currency}${formatCurrency(segment.previousBalance)} - ${new Date(segment.timestamp).toLocaleDateString()}`,
  value: segment.id
}));

  setSegmentDropdownData(dropdownData);
  
  // Set default selected segment
  if (allSegments.length > 0 && selectedSegmentId === null) {
    setSelectedSegmentId(allSegments[0].id);
  } else if (allSegments.length === 0) {
    setSelectedSegmentId(null);
  } else if (selectedSegmentId !== null && !allSegments.find(seg => seg.id === selectedSegmentId)) {
    setSelectedSegmentId(allSegments[0]?.id || null);
  }
  
  // Apply sorting to each category
  setFilteredTransactions({
    new: sortTransactions(newTransactions),
    old: sortTransactions(oldTransactions)
  });
};
  
  useEffect(filterTransactions, [
    transactions,
    selectedFilter,
    dateRange,
    selectedSort,
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

 
// Replace your restoreOldTransactions function with this:

const restoreOldTransactions = async () => {
  const latestBackupId = await AsyncStorage.getItem(`@latestBackupId_${customer.id}`);
  
  if (!latestBackupId) {
    Alert.alert("No Backup Found", "There are no backups available to restore.");
    return;
  }
  
  const str = await AsyncStorage.getItem(`@oldTxBackup_${customer.id}_${latestBackupId}`);
  
  if (!str) {
    Alert.alert("No Backup Found", "The backup file could not be found.");
    return;
  }
  
  const backupData = JSON.parse(str);
  const oldTx: Transaction[] = backupData.transactions;
  
  // Check if transactions already exist in database
  const txIds = oldTx.map(tx => tx.transaction_id).filter(id => id);
  const { data: existingTxs } = await supabase
    .from("transactions")
    .select("transaction_id")
    .in("transaction_id", txIds);
  
  if (existingTxs && existingTxs.length === oldTx.length) {
    Alert.alert(
      "Already in List",
      `These transactions are already in your transaction list.\n\n` +
      `Transactions: ${backupData.transactions.length}\n` +
      `Total Amount: ${currency}${formatCurrency(backupData.totalAmount)}\n\n` +
      `No need to restore.`
    );
    return;
  }
  
  // *** KEY CHANGE: Check which tab we're on ***
  const isRestoringFromNewTab = activeTab === "new";
  
  // Check if this backup contains OLD transactions (balance_after = 0 for last transaction)
  const isOldTransactionsBackup = oldTx.length > 0 && 
    (oldTx[oldTx.length - 1].balance_after === 0 || oldTx[oldTx.length - 1].balance_after === null);
  
  // *** ENFORCE TAB-SPECIFIC RESTORE ***
  if (isRestoringFromNewTab && isOldTransactionsBackup) {
    Alert.alert(
      "Wrong Tab",
      "You're trying to restore OLD (paid) transactions from the NEW tab.\n\n" +
      "Please switch to the OLD TRANSACTIONS tab to restore these."
    );
    return;
  }
  
  if (!isRestoringFromNewTab && !isOldTransactionsBackup) {
    Alert.alert(
      "Wrong Tab",
      "You're trying to restore NEW (unpaid) transactions from the OLD tab.\n\n" +
      "Please switch to the NEW TRANSACTIONS tab to restore these."
    );
    return;
  }
  
  const confirmMessage = isOldTransactionsBackup
    ? `Restore ${oldTx.length} old transaction(s)?\n\nNote: These are already-paid transactions. Your current balance will NOT be changed.\n\nBackup created: ${new Date(backupData.timestamp).toLocaleString()}`
    : `Restore ${oldTx.length} transaction(s) and add ${currency}${formatCurrency(backupData.totalAmount)} to balance?\n\nBackup created: ${new Date(backupData.timestamp).toLocaleString()}`;
  
  const ok = await confirmAsync("Confirm Restore", confirmMessage);
  if (!ok) return;
  
  try {
    for (const tx of oldTx) {
      const { backup_id, ...txWithoutBackupId } = tx as any;
      
      const { error } = await supabase
        .from("transactions")
        .upsert(txWithoutBackupId, { onConflict: "transaction_id" });
      
      if (error) {
        console.error("Error restoring transaction:", error);
      }
    }
    
    // Only update balance if these are NEW transactions (not old/paid transactions)
    if (!isOldTransactionsBackup) {
      const totalToRestore = backupData.totalAmount;
      const newBalance = currentBalance + totalToRestore;
      
      const { error: balanceError } = await supabase
        .from("customers")
        .update({ balance: newBalance })
        .eq("id", customer.id);
      
      if (balanceError) {
        console.error("Error updating balance:", balanceError);
        Alert.alert("Error", "Failed to update balance");
        return;
      }
      
      setCurrentBalance(newBalance);
    }
    
    await markBackupAsRestored(latestBackupId);
    
    backupData.restored = true;
    await AsyncStorage.setItem(
      `@oldTxBackup_${customer.id}_${latestBackupId}`,
      JSON.stringify(backupData)
    );
    
    await fetchTransactions();
    await fetchCustomerBalance();
    
    const successMessage = isOldTransactionsBackup
      ? `${oldTx.length} old transaction(s) restored!\n\nYour current balance remains: ${currency}${formatCurrency(currentBalance)}\n\nThese already-paid transactions are now visible in the Old Transactions tab.`
      : `${oldTx.length} transaction(s) restored!\n\nOld Balance: ${currency}${formatCurrency(currentBalance)}\nRestored Amount: ${currency}${formatCurrency(backupData.totalAmount)}\nNew Balance: ${currency}${formatCurrency(currentBalance + backupData.totalAmount)}`;
    
    Alert.alert("Restore Complete", successMessage);
    
    setIsRestored(true);
  } catch (error) {
    console.error("Error during restore:", error);
    Alert.alert("Error", "Failed to restore transactions. Please try again.");
  }
};

  // Delete with backup using unique IDs
  const handleDeleteWithBackup = () => {
    const tabName = activeTab === "new" ? "NEW" : "OLD";
    
    Alert.alert(
      `Delete ${tabName} Transactions (With Backup)`,
      `This will delete all ${tabName.toLowerCase()} transactions and create a backup. You can restore them later. Balance will NOT be changed.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: `Delete & Backup`,
          style: "destructive",
          onPress: async () => {
            let transactionsToBackup: Transaction[] = [];
            let transactionIdsToDelete: string[] = [];
            
            if (activeTab === "new") {
              const { newTransactions } = getTransactionSegments(transactions);
              transactionsToBackup = newTransactions;
              transactionIdsToDelete = newTransactions
                .map(tx => tx.transaction_id || "")
                .filter(id => id !== "");
            } else if (activeTab === "old") {
              const { oldTransactions } = getTransactionSegments(transactions);
              transactionsToBackup = oldTransactions;
              transactionIdsToDelete = oldTransactions
                .map(tx => tx.transaction_id || "")
                .filter(id => id !== "");
            }
            
            if (transactionIdsToDelete.length === 0) {
              Alert.alert("No transactions to delete");
              return;
            }
            
            const transactionIdString = transactionIdsToDelete.sort().join('_');
            const backupId = `backup_${transactionIdString.substring(0, 50)}_${transactionsToBackup.length}`;
            
            const restoredBackups = await getRestoredBackupIds();
            if (restoredBackups.includes(backupId)) {
              Alert.alert(
                "⚠️ Warning",
                "These transactions were previously backed up and restored. They can still be restored again, but the balance will NOT be adjusted a second time.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Continue Anyway",
                    onPress: async () => {
                      await performBackupAndDelete(
                        backupId,
                        transactionsToBackup,
                        transactionIdsToDelete,
                        tabName
                      );
                    }
                  }
                ]
              );
              return;
            }
            
            await performBackupAndDelete(
              backupId,
              transactionsToBackup,
              transactionIdsToDelete,
              tabName
            );
          },
        },
      ]
    );
  };

  // Delete permanently (no backup, cannot be restored)
// Replace your handleDeletePermanently function with this corrected version:

const handleDeletePermanently = () => {
  const tabName = activeTab === "new" ? "NEW" : "OLD";
  const buttonLabel = activeTab === "new" ? "Delete" : "Delete Permanently";
  
  Alert.alert(
    `⚠️ ${buttonLabel} ${tabName} Transactions`,
    `WARNING: This will PERMANENTLY delete all ${tabName.toLowerCase()} transactions. This action CANNOT be undone and NO backup will be created.`,
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "I Understand, Delete Permanently",
        style: "destructive",
        onPress: () => {
          Alert.alert(
            "⚠️ Final Confirmation",
            "Are you absolutely sure? This cannot be undone.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Yes, Delete Forever",
                style: "destructive",
                onPress: async () => {
                  let transactionIdsToDelete: string[] = [];
                  
                  if (activeTab === "new") {
                    const { newTransactions } = getTransactionSegments(transactions);
                    transactionIdsToDelete = newTransactions
                      .map(tx => tx.transaction_id || "")
                      .filter(id => id !== "");
                    
                    // *** FIX: ADD back the transaction amounts to balance ***
                    // Because deleting payments means customer owes that money again
                    const totalToAddBack = newTransactions.reduce(
                      (sum, tx) => sum + tx.amount,
                      0
                    );
                    
                    if (totalToAddBack > 0) {
                      const newBalance = currentBalance + totalToAddBack; // CHANGED from minus to plus
                      
                      const { error: balanceError } = await supabase
                        .from("customers")
                        .update({ balance: newBalance })
                        .eq("id", customer.id);
                      
                      if (balanceError) {
                        console.error("Error updating balance:", balanceError);
                        Alert.alert("Error", "Failed to update balance");
                        return;
                      }
                      
                      setCurrentBalance(newBalance);
                    }
                  } else if (activeTab === "old") {
                    const { oldTransactions } = getTransactionSegments(transactions);
                    transactionIdsToDelete = oldTransactions
                      .map(tx => tx.transaction_id || "")
                      .filter(id => id !== "");
                    
                    // Remove any backups for old transactions
                    await AsyncStorage.removeItem(`@oldTxBackup_${customer.id}`);
                  }
                  
                  if (transactionIdsToDelete.length === 0) {
                    Alert.alert("No transactions to delete");
                    return;
                  }
                  
                  // Delete from database
                  await supabase
                    .from("transactions")
                    .delete()
                    .in("transaction_id", transactionIdsToDelete);
                    
                  // Update local state
                  setTransactions(prev => 
                    prev.filter(tx => !transactionIdsToDelete.includes(tx.transaction_id || ""))
                  );
                  
                  setSelectedTransactions([]);
                  
                  Alert.alert(
                    "Permanently Deleted", 
                    `${tabName} transactions have been permanently removed and cannot be restored.`
                  );
                },
              },
            ]
          );
        },
      },
    ]
  );
};


 const handleDeleteSelected = () => {
    if (!selectedTransactions.length) {
      Alert.alert("No transactions selected");
      return;
    }
    
    // Only allow deleting from NEW tab
    if (activeTab !== "new") {
      Alert.alert(
        "Cannot Delete",
        "Please use 'Delete with Backup' or 'Delete Permanently' buttons for old transactions."
      );
      return;
    }
    
    const txsToDelete = transactions.filter((tx) =>
      selectedTransactions.includes(tx.transaction_id || "")
    );
    const totalAmount = txsToDelete.reduce((sum, tx) => sum + tx.amount, 0);
    const newBalance = currentBalance + totalAmount;
    
    Alert.alert(
      `⚠️ Delete ${selectedTransactions.length} Selected Transaction${selectedTransactions.length > 1 ? 's' : ''}`,
      `WARNING: This will PERMANENTLY delete the selected transaction${selectedTransactions.length > 1 ? 's' : ''}. This action CANNOT be undone and NO backup will be created.\n\nAmount to be added back: ${currency}${formatCurrency(totalAmount)}\nNew Balance: ${currency}${formatCurrency(newBalance)}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "I Understand, Delete Permanently",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "⚠️ Final Confirmation",
              "Are you absolutely sure? This cannot be undone.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Yes, Delete Forever",
                  style: "destructive",
                  onPress: async () => {
                    // Delete from database
                    await supabase
                      .from("transactions")
                      .delete()
                      .in("transaction_id", selectedTransactions);
                    
                    // Update balance - add back the amount since payments are being removed
                    const { error: balanceError } = await supabase
                      .from("customers")
                      .update({ balance: newBalance })
                      .eq("id", customer.id);
                    
                    if (balanceError) {
                      console.error("Error updating balance:", balanceError);
                      Alert.alert("Error", "Failed to update balance");
                      return;
                    }
                    
                    setCurrentBalance(newBalance);
                    
                    // Update local state
                    setTransactions(prev => 
                      prev.filter(tx => !selectedTransactions.includes(tx.transaction_id || ""))
                    );
                    
                    setSelectedTransactions([]);
                    
                    Alert.alert(
                      "Permanently Deleted", 
                      `${txsToDelete.length} transaction${txsToDelete.length > 1 ? 's have' : ' has'} been permanently removed.\n\nOld Balance: ${currency}${formatCurrency(currentBalance)}\nAmount Added Back: ${currency}${formatCurrency(totalAmount)}\nNew Balance: ${currency}${formatCurrency(newBalance)}`
                    );
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  // --- OFFLINE QUEUE LOGIC ---

  const enqueueTransaction = async (
    tx: Omit<Transaction, "transaction_id">
  ) => {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const queue: any[] = raw ? JSON.parse(raw) : [];
    queue.push(tx);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  };

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

  const oldBalance = currentBalance;
  const balanceAfter = currentBalance - amount;

  // EXPLICITLY set all values - DON'T let Supabase auto-generate anything
  const txPayload = {
    customer_id: customer.id,
    amount: amount,
    old_balance: oldBalance,
    balance_after: balanceAfter,
    created_at: new Date().toISOString(),
  };

  console.log("=== INSERTING TRANSACTION ===");
  console.log("Payload:", JSON.stringify(txPayload, null, 2));

  if (!isConnected) {
    await enqueueTransaction(txPayload);
    setCurrentBalance(balanceAfter);
    setTransactions((prev) => [
      { ...txPayload, transaction_id: `queued-${Date.now()}` },
      ...prev,
    ]);
    setNewAmount("");
    setAddModalVisible(false);
    return;
  }

  // Use .insert() with explicit column names
  const { data, error } = await supabase
    .from("transactions")
    .insert([{
      customer_id: txPayload.customer_id,
      amount: txPayload.amount,
      old_balance: txPayload.old_balance,
      balance_after: txPayload.balance_after,
      created_at: txPayload.created_at
    }])
    .select();
    
  console.log("=== SUPABASE RESPONSE ===");
  console.log("Data:", JSON.stringify(data, null, 2));
  console.log("Error:", error);
    
  if (!error && data?.[0]) {
    console.log("Inserted old_balance:", data[0].old_balance);
    console.log("Inserted balance_after:", data[0].balance_after);
    
    await supabase
      .from("customers")
      .update({ balance: balanceAfter })
      .eq("id", customer.id);
      
    setCurrentBalance(balanceAfter);
    setNewAmount("");
    setAddModalVisible(false);
    fetchTransactions();
  } else {
    Alert.alert("Failed to add transaction", error?.message || "Unknown error");
  }
};
  // --- CONNECTIVITY & SYNC ---

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setIsConnected(!!state.isConnected);
    });
    return () => unsub();
  }, []);

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

 const getVisibleTransactions = () => {
  if (activeTab === "new") {
    return filteredTransactions.new;
  } else {
    // For old tab, only return transactions from the selected segment
    if (selectedSegmentId !== null) {
      return sortTransactions(getTransactionsForSegment(selectedSegmentId));
    }
    return [];
  }
};
  
  const visibleTransactions = getVisibleTransactions();
  const visibleCount = visibleTransactions.length;
  const visibleAmount = visibleTransactions.reduce(
    (sum, tx) => sum + tx.amount,
    0
  );
  
const renderTransactionItem = (tx: Transaction, type: 'new' | 'old') => (
  <View key={tx.transaction_id} style={styles.transactionItem}>
    <View style={styles.transactionInfo}>
      <Text style={styles.dateText}>
        {new Date(tx.created_at!).toLocaleDateString()}
      </Text>
      <Text style={styles.amountText}>
        {currency}
        {formatCurrency(tx.amount)}
      </Text>
      {/* Only show balance calculation for NEW transactions */}
      {type === 'new' && (
        <Text style={styles.balanceText}>
          {currency}
          {formatCurrency(tx.old_balance ?? 0)} -{" "}
          {currency}
          {formatCurrency(tx.amount)} ={" "}
          {currency}
          {formatCurrency(tx.balance_after ?? 0)}
        </Text>
      )}
      {/* For OLD transactions, ONLY show the payment date - NO BALANCE INFO */}
      {type === 'old' && (
        <Text style={styles.balanceText}>
          Payment: {currency}{formatCurrency(tx.amount)}
        </Text>
      )}
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

      <View style={styles.tabContainer}>
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

      <View style={styles.sortContainer}>
        <TouchableOpacity
          style={styles.sortButton}
          onPress={() => setShowSortDropdown(!showSortDropdown)}
        >
          <AntDesign name="swap" size={16} color="white" style={styles.sortIcon} />
          <Text style={styles.sortButtonText}>{getSelectedSortLabel()}</Text>
          <AntDesign 
            name={showSortDropdown ? "up" : "down"} 
            size={16} 
            color="white" 
            style={styles.sortArrow}
          />
        </TouchableOpacity>
        
        {showSortDropdown && (
          <View style={styles.dropdownOptions}>
            {sortOptions.map((sort) => (
              <TouchableOpacity
                key={sort.value}
                style={[
                  styles.dropdownOption,
                  selectedSort === sort.value && styles.activeDropdownOption
                ]}
                onPress={() => handleSortPress(sort.value)}
              >
                <Text
                  style={[
                    styles.dropdownOptionText,
                    selectedSort === sort.value && styles.activeDropdownOptionText
                  ]}
                >
                  {sort.label}
                </Text>
                {selectedSort === sort.value && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

     <View style={styles.totalContainer}>
  <Text style={styles.totalText}>
    {activeTab === "new" ? "New" : "Old"} Transactions: {visibleCount}
  </Text>
  <Text style={styles.totalText}>
    Total Amount Paid: {currency}{formatCurrency(visibleAmount)}
  </Text>
 </View>

{activeTab === "new" && (
  <>
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
          onPress={handleDeleteSelected}
        >
          <Text style={styles.buttonText}>Delete Selected</Text>
        </TouchableOpacity>
      )}
    </View>

    <View style={styles.buttonRow}>
      <TouchableOpacity
        style={[styles.button, styles.deletePermanentButton]}
        onPress={handleDeletePermanently}
      >
        <Text style={styles.buttonText}>Delete</Text>  {/* CHANGED HERE */}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.viewOldButton]}
        onPress={() => navigation.navigate('OldTransactions', { customer })}
      >
        <Text style={styles.buttonText}>View All Old Transactions</Text>
      </TouchableOpacity>
    </View>
  </>
)}


{activeTab === "old" && (
  <>
    <View style={styles.buttonRow}>
      <TouchableOpacity
        style={[styles.button, styles.deleteWithBackupButton]}
        onPress={handleDeleteWithBackup}
      >
        <Text style={styles.buttonText}>Delete with Backup</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.deletePermanentButton]}
        onPress={handleDeletePermanently}
      >
        <Text style={styles.buttonText}>⚠️ Delete Permanently</Text>
      </TouchableOpacity>
    </View>

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
  </>
)}

      

      <View style={styles.transactionsContainer}>
        {activeTab === "old" ? (
          oldSegmentsList.length > 0 ? (
            <>
              <View style={styles.previousBalanceDropdownContainer}>
                <Text style={styles.dropdownLabel}>Select Transaction History:</Text>
                <Dropdown
                  style={styles.balanceDropdown}
                  data={segmentDropdownData}
                  labelField="label"
                  valueField="value"
                  value={selectedSegmentId}
                  onChange={(item) => {
                    console.log("Selected segment:", item.value);
                    setSelectedSegmentId(item.value);
                  }}
                  renderLeftIcon={() => (
                    <AntDesign
                      name="wallet"
                      size={20}
                      color="#4CAF50"
                      style={styles.icon}
                    />
                  )}
                  selectedTextStyle={styles.balanceDropdownText}
                  placeholderStyle={styles.balanceDropdownText}
                  placeholder="Select History"
                />
              </View>
              
              {selectedSegmentId !== null && (() => {
                const segmentTransactions = sortTransactions(getTransactionsForSegment(selectedSegmentId));
                const segment = oldSegmentsList.find(seg => seg.id === selectedSegmentId);
                
                console.log("=== RENDERING OLD TRANSACTIONS ===");
                console.log("Selected segment ID:", selectedSegmentId);
                console.log("Segment transactions found:", segmentTransactions.length);
                console.log("Segment transaction IDs:", segmentTransactions.map(tx => tx.transaction_id));
                
                if (segmentTransactions.length === 0 || !segment) {
                  return (
                    <View style={styles.emptyContainer}>
                      <Text style={styles.emptyText}>
                        No transactions found for this segment
                      </Text>
                    </View>
                  );
                }
                
                return (
                  <View style={styles.balanceSegment}>
                    <View style={styles.previousBalanceHeader}>
                      <Text style={styles.previousBalanceLabel}>Previous Balance:</Text>
                      <Text style={styles.previousBalanceAmount}>
                        {currency}{formatCurrency(segment.previousBalance)}
                      </Text>
                    </View>
                    
                    {segmentTransactions.map((tx) => {
                      console.log("Rendering transaction:", tx.transaction_id);
                      return renderTransactionItem(tx, "old");
                    })}
                    
                    <View style={styles.paidBadgeContainer}>
                      <Text style={styles.paidBadgeText}>✓ PAID</Text>
                    </View>
                  </View>
                );
              })()}
            </>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                No old transactions found
              </Text>
            </View>
          )
        ) : (
          <>
            {visibleTransactions.length > 0 ? (
              visibleTransactions.map((tx) => renderTransactionItem(tx, activeTab))
            ) : (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                  No new transactions found
                </Text>
              </View>
            )}
          </>
        )}
      </View>

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
  sortContainer: {
    position: "relative",
    marginBottom: 16,
  },
  sortButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2A2F35",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sortIcon: {
    marginRight: 8,
  },
  sortButtonText: {
    flex: 1,
    color: "#FFF",
    fontSize: 16,
  },
  sortArrow: {
    marginLeft: 8,
  },
  dropdownOptions: {
    position: "absolute",
    top: 52,
    left: 0,
    right: 0,
    backgroundColor: "#2A2F35",
    borderRadius: 8,
    zIndex: 1000,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  dropdownOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1C1F24",
  },
  activeDropdownOption: {
    backgroundColor: "#1C1F24",
  },
  dropdownOptionText: {
    color: "#FFF",
    fontSize: 16,
  },
  activeDropdownOptionText: {
    color: "#4CAF50",
    fontWeight: "600",
  },
  checkmark: {
    color: "#4CAF50",
    fontSize: 16,
    fontWeight: "bold",
  },
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
  deleteWithBackupButton: { 
    backgroundColor: "#FF9800"
  },
  deletePermanentButton: { 
    backgroundColor: "#D32F2F"
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
  dateAndIdRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  backupIdBadge: {
    fontSize: 10,
    color: "#FF9800",
    backgroundColor: "#2A2F35",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontFamily: "monospace",
  },
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
  },
  balanceSegment: {
    marginBottom: 24,
  },
  previousBalanceDropdownContainer: {
    marginBottom: 16,
  },
  dropdownLabel: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  previousBalanceHeader: {
    backgroundColor: "#2A2F35",
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderLeftWidth: 4,
    borderLeftColor: "#4CAF50",
  },
  previousBalanceContainer: {
    backgroundColor: "#2A2F35",
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#4CAF50",
  },
  previousBalanceLabel: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  dropdownWrapper: {
    width: "100%",
  },
  balanceDropdown: {
    backgroundColor: "#1C1F24",
    borderRadius: 8,
    paddingHorizontal: 16,
    height: 50,
    borderWidth: 1,
    borderColor: "#4CAF50",
  },
  balanceDropdownText: {
    color: "#4CAF50",
    fontSize: 18,
    fontWeight: "bold",
  },
  previousBalanceAmount: {
    color: "#4CAF50",
    fontSize: 20,
    fontWeight: "bold",
  },
  paidBadgeContainer: {
    backgroundColor: "#4CAF50",
    borderRadius: 8,
    padding: 16,
    marginTop: 16,
    alignItems: "center",
  },
  paidBadgeText: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "bold",
    letterSpacing: 2,
  },
  debugContainer: {
    backgroundColor: "#2A2F35",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#FF9800",
  },
  debugText: {
    color: "#FFD700",
    fontSize: 12,
    fontFamily: "monospace",
    marginVertical: 2,
  },
});