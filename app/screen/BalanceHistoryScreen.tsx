import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { useRoute, useNavigation, useFocusEffect } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { DatePickerModal } from "react-native-paper-dates";
import { supabase } from "../supabase/supabaseClient";
import { useCurrency } from "../context/CurrencyContext";

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
  type?: 'balance_add' | 'balance_edit' | 'balance_delete' | 'transaction';
  description?: string;
};

type FilterType = {
  label: string;
  value: string;
};

type RootStackParamList = {
  BalanceHistoryScreen: { customer: Customer };
};

type BalanceHistoryNavigationProp = StackNavigationProp<
  RootStackParamList,
  "BalanceHistoryScreen"
>;

export default function BalanceHistoryScreen() {
  const route = useRoute();
  const navigation = useNavigation<BalanceHistoryNavigationProp>();
  const { customer } = route.params as { customer: Customer };
  const { currency } = useCurrency();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<string>("all");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [customDateRange, setCustomDateRange] = useState<{
    startDate?: Date;
    endDate?: Date;
  }>({});

  const filters: FilterType[] = [
    { label: "Today", value: "today" },
    { label: "This Week", value: "week" },
    { label: "This Month", value: "month" },
    { label: "This Year", value: "year" },
    { label: "Custom Date", value: "custom" },
    { label: "All Transactions", value: "all" },
  ];

  const formatCurrency = (amount: number) => {
    return amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const getDateRange = (filterValue: string) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (filterValue) {
      case "today":
        return {
          start: today,
          end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)
        };
      case "week":
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);
        return { start: weekStart, end: weekEnd };
      case "month":
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        monthEnd.setHours(23, 59, 59, 999);
        return { start: monthStart, end: monthEnd };
      case "year":
        const yearStart = new Date(today.getFullYear(), 0, 1);
        const yearEnd = new Date(today.getFullYear(), 11, 31);
        yearEnd.setHours(23, 59, 59, 999);
        return { start: yearStart, end: yearEnd };
      case "custom":
        if (customDateRange.startDate && customDateRange.endDate) {
          return {
            start: customDateRange.startDate,
            end: customDateRange.endDate
          };
        }
        return null;
      default:
        return null;
    }
  };

  const filterTransactions = useCallback((filterValue: string) => {
    if (filterValue === "all") {
      setFilteredTransactions(transactions);
      return;
    }

    const dateRange = getDateRange(filterValue);
    if (!dateRange) {
      setFilteredTransactions(transactions);
      return;
    }

    const filtered = transactions.filter(transaction => {
      if (!transaction.created_at) return false;
      const transactionDate = new Date(transaction.created_at);
      return transactionDate >= dateRange.start && transactionDate <= dateRange.end;
    });

    setFilteredTransactions(filtered);
  }, [transactions, customDateRange]);

  const fetchBalanceTransactions = async () => {
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("customer_id", customer.id)
      .in("type", ['balance_add', 'balance_edit', 'balance_delete'])
      .order("created_at", { ascending: false });
    
    if (error) {
      console.error("Error fetching balance transactions:", error);
    } else {
      setTransactions(data || []);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchBalanceTransactions();
    setRefreshing(false);
  }, []);

  const handleFilterPress = (filterValue: string) => {
    setSelectedFilter(filterValue);
    setShowFilterDropdown(false);
    if (filterValue === "custom") {
      setShowDatePicker(true);
    } else {
      filterTransactions(filterValue);
    }
  };

  const onDatePickerConfirm = ({ startDate, endDate }: { startDate?: Date; endDate?: Date }) => {
    setCustomDateRange({ startDate, endDate });
    setShowDatePicker(false);
    if (startDate && endDate) {
      filterTransactions("custom");
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchBalanceTransactions();
    }, [customer.id])
  );

  // Apply filter when transactions change
  React.useEffect(() => {
    filterTransactions(selectedFilter);
  }, [transactions, filterTransactions, selectedFilter]);

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'balance_add':
        return '➕';
      case 'balance_edit':
        return '✏️';
      case 'balance_delete':
        return '🗑️';
      default:
        return '📝';
    }
  };

  const getTransactionColor = (type: string) => {
    switch (type) {
      case 'balance_add':
        return '#4CAF50';
      case 'balance_edit':
        return '#2196F3';
      case 'balance_delete':
        return '#F44336';
      default:
        return '#FFFFFF';
    }
  };

  const getTransactionTypeText = (type: string) => {
    switch (type) {
      case 'balance_add':
        return 'Balance Added';
      case 'balance_edit':
        return 'Balance Edited';
      case 'balance_delete':
        return 'Balance Reset';
      default:
        return 'Transaction';
    }
  };

  const getCustomDateText = () => {
    if (customDateRange.startDate && customDateRange.endDate) {
      const start = customDateRange.startDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
      const end = customDateRange.endDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
      return `${start} - ${end}`;
    }
    return "Custom Date";
  };

  const getSelectedFilterLabel = () => {
    if (selectedFilter === "custom") {
      return getCustomDateText();
    }
    const selectedFilterObj = filters.find(filter => filter.value === selectedFilter);
    return selectedFilterObj ? selectedFilterObj.label : "All Transactions";
  };

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header Section */}
      <View style={styles.headerContainer}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Balance History</Text>
        <Text style={styles.customerName}>{customer.name}</Text>
      </View>

      {/* Current Balance Display */}
      <View style={styles.currentBalanceContainer}>
        <Text style={styles.currentBalanceLabel}>Current Balance</Text>
        {Number(customer.balance ?? 0) === 0 ? (
          <Text style={styles.paidText}>Paid</Text>
        ) : (
          <Text style={styles.currentBalanceValue}>
            {currency}{formatCurrency(Number(customer.balance ?? 0))}
          </Text>
        )}
      </View>

      {/* Filter Section */}
      <View style={styles.filterContainer}>
        <Text style={styles.filterTitle}>Filter by Date</Text>
        
        {/* Dropdown Button */}
        <TouchableOpacity 
          style={styles.dropdownButton} 
          onPress={() => setShowFilterDropdown(!showFilterDropdown)}
        >
          <Text style={styles.dropdownButtonText}>
            {getSelectedFilterLabel()}
          </Text>
          <Text style={[styles.dropdownArrow, { transform: [{ rotate: showFilterDropdown ? '180deg' : '0deg' }] }]}>
            ▼
          </Text>
        </TouchableOpacity>

        {/* Dropdown Options */}
        {showFilterDropdown && (
          <View style={styles.dropdownOptions}>
            {filters.map((filter) => (
              <TouchableOpacity
                key={filter.value}
                style={[
                  styles.dropdownOption,
                  selectedFilter === filter.value && styles.activeDropdownOption
                ]}
                onPress={() => handleFilterPress(filter.value)}
              >
                <Text
                  style={[
                    styles.dropdownOptionText,
                    selectedFilter === filter.value && styles.activeDropdownOptionText
                  ]}
                >
                  {filter.value === "custom" ? getCustomDateText() : filter.label}
                </Text>
                {selectedFilter === filter.value && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Balance History List */}
      <View style={styles.historyContainer}>
        <Text style={styles.sectionTitle}>
          Balance Changes ({filteredTransactions.length})
        </Text>
        
        {filteredTransactions.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {selectedFilter === "all" 
                ? "No balance history found" 
                : "No transactions found for the selected period"
              }
            </Text>
          </View>
        ) : (
          filteredTransactions.map((transaction, index) => (
            <View key={transaction.transaction_id || index} style={styles.historyItem}>
              <View style={styles.transactionHeader}>
                <View style={styles.transactionTypeContainer}>
                  <Text style={styles.transactionIcon}>
                    {getTransactionIcon(transaction.type || '')}
                  </Text>
                  <Text 
                    style={[
                      styles.transactionType, 
                      { color: getTransactionColor(transaction.type || '') }
                    ]}
                  >
                    {getTransactionTypeText(transaction.type || '')}
                  </Text>
                </View>
                <Text style={styles.transactionDate}>
                  {transaction.created_at
                    ? new Date(transaction.created_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    : ""}
                </Text>
              </View>
              
              <View style={styles.transactionDetails}>
                <Text style={styles.amountText}>
                  {transaction.type === 'balance_add' ? '+' : 
                   transaction.type === 'balance_delete' ? '-' : '±'}
                  {currency}{formatCurrency(Math.abs(transaction.amount))}
                </Text>
                
                {transaction.old_balance !== undefined && transaction.balance_after !== undefined && (
                  <Text style={styles.balanceChangeText}>
                    Balance: {currency}{formatCurrency(transaction.old_balance ?? 0)} → {currency}{formatCurrency(transaction.balance_after ?? 0)}
                  </Text>
                )}
                
                {transaction.description && (
                  <Text style={styles.descriptionText}>
                    {transaction.description}
                  </Text>
                )}
              </View>
            </View>
          ))
        )}
      </View>

      {/* Date Picker Modal */}
      <DatePickerModal
        locale="en"
        mode="range"
        visible={showDatePicker}
        onDismiss={() => setShowDatePicker(false)}
        startDate={customDateRange.startDate}
        endDate={customDateRange.endDate}
        onConfirm={onDatePickerConfirm}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: "#121212", 
    paddingHorizontal: 20 
  },
  headerContainer: { 
    marginTop: 20, 
    marginBottom: 20 
  },
  backButton: {
    alignSelf: "flex-start",
    marginBottom: 10,
  },
  backButtonText: {
    color: "#006A6A",
    fontSize: 16,
    fontWeight: "600",
  },
  screenTitle: { 
    color: "#FFFFFF", 
    fontSize: 24, 
    fontWeight: "bold",
    marginBottom: 8
  },
  customerName: { 
    color: "#AAAAAA", 
    fontSize: 16 
  },
  currentBalanceContainer: {
    backgroundColor: "#1A1A1A",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  currentBalanceLabel: { 
    color: "#AAAAAA", 
    fontSize: 14, 
    marginBottom: 8 
  },
  currentBalanceValue: { 
    color: "#FFFFFF", 
    fontSize: 28, 
    fontWeight: "bold" 
  },
  paidText: { 
    color: "#4CAF50", 
    fontSize: 28, 
    fontWeight: "bold" 
  },
  filterContainer: {
    marginBottom: 20,
  },
  filterTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  dropdownButton: {
    backgroundColor: "#1A1A1A",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#333333",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dropdownButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "500",
  },
  dropdownArrow: {
    color: "#AAAAAA",
    fontSize: 14,
    fontWeight: "bold",
  },
  dropdownOptions: {
    backgroundColor: "#1A1A1A",
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#333333",
    maxHeight: 250,
  },
  dropdownOption: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#333333",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  activeDropdownOption: {
    backgroundColor: "#006A6A20",
  },
  dropdownOptionText: {
    color: "#AAAAAA",
    fontSize: 16,
    fontWeight: "500",
  },
  activeDropdownOptionText: {
    color: "#006A6A",
    fontWeight: "600",
  },
  checkmark: {
    color: "#006A6A",
    fontSize: 16,
    fontWeight: "bold",
  },
  historyContainer: { 
    flex: 1 
  },
  sectionTitle: { 
    color: "#FFFFFF", 
    fontSize: 18, 
    fontWeight: "600", 
    marginBottom: 15 
  },
  emptyContainer: {
    backgroundColor: "#1A1A1A",
    borderRadius: 12,
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    color: "#AAAAAA",
    fontSize: 16,
    textAlign: "center",
  },
  historyItem: { 
    backgroundColor: "#1C1F24", 
    borderRadius: 12, 
    padding: 16, 
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#4CAF50"
  },
  transactionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  transactionTypeContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  transactionIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  transactionType: { 
    fontSize: 16, 
    fontWeight: "600",
  },
  transactionDate: { 
    color: "#AAAAAA", 
    fontSize: 12,
    textAlign: "right",
  },
  transactionDetails: {
    gap: 6,
  },
  amountText: { 
    color: "#FFFFFF", 
    fontSize: 20, 
    fontWeight: "bold" 
  },
  balanceChangeText: { 
    color: "#CCCCCC", 
    fontSize: 14,
    fontFamily: "monospace",
  },
  descriptionText: { 
    color: "#AAAAAA", 
    fontSize: 13,
    fontStyle: "italic",
    marginTop: 4,
  },
});