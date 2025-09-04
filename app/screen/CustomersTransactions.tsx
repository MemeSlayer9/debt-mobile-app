// HomeScreen.tsx
import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  StatusBar,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect, useNavigation, NavigationProp } from "@react-navigation/native";
import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../supabase/supabaseClient";
import { DatePickerModal } from "react-native-paper-dates";
import { Dropdown } from "react-native-element-dropdown";
import { useCurrency } from "../context/CurrencyContext";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../navigation/navigationTypes";

export type Customer = {
  id: number;
  user_id: string;
  name: string;
  email: string;
  phone: string;
  balance: number;
  date: string;
  checked?: boolean;
};
export type Transaction = {
  transaction_id?: string;
  customer_id?: number;
  amount: number;
  created_at?: string;
  old_balance?: number | null;
  balance_after?: number | null;
};

type FilterType = { label: string; value: string; };
type CustomRange = { startDate: Date | null; endDate: Date | null; };

const formatCurrency = (amount: number) => {
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

const getDateRange = (filter: string, customRange: CustomRange) => {
  const now = new Date();
  let startDate: Date | null = null;
  let endDate: Date | null = null;
  switch (filter) {
    case "today":
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      endDate   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      break;
    case "week": {
      const firstDay = now.getDate() - now.getDay();
      startDate = new Date(now.getFullYear(), now.getMonth(), firstDay);
      endDate   = new Date(now.getFullYear(), now.getMonth(), firstDay + 7);
      break;
    }
    case "month":
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate   = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      break;
    case "year":
      startDate = new Date(now.getFullYear(), 0, 1);
      endDate   = new Date(now.getFullYear() + 1, 0, 1);
      break;
    case "custom":
      startDate = customRange.startDate;
      endDate   = customRange.endDate;
      break;
  }
  return { startDate, endDate };
};

const CustomerCard: React.FC<{
  customer: Customer;
  selectedFilter: string;
  customRange: CustomRange;
  isOnline: boolean;
}> = ({ customer, selectedFilter, customRange, isOnline }) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loaded, setLoaded]     = useState(false);
  const [expanded, setExpanded] = useState(false);
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { currency } = useCurrency();

  const loadTxns = useCallback(async () => {
    const key = `@cached_txns_${customer.id}_${selectedFilter}`;
    if (isOnline) {
      // fetch from Supabase
      let q = supabase
        .from("transactions")
        .select("*")
        .eq("customer_id", customer.id);
      if (selectedFilter !== "all") {
        const { startDate, endDate } = getDateRange(selectedFilter, customRange);
        if (startDate && endDate) {
          q = q.gte("created_at", startDate.toISOString())
               .lt("created_at", endDate.toISOString());
        }
      }
      q = q.order("created_at", { ascending: false });
      const { data, error } = await q;
      if (!error && data) {
        setTransactions(data);
        await AsyncStorage.setItem(key, JSON.stringify(data));
      }
    } else {
      // offline: load from cache
      const raw = await AsyncStorage.getItem(key);
      if (raw) setTransactions(JSON.parse(raw));
      else setTransactions([]);
    }
    setLoaded(true);
  }, [customer.id, selectedFilter, customRange, isOnline]);

  useFocusEffect(
    React.useCallback(() => { loadTxns(); }, [loadTxns])
  );

  if (loaded && transactions.length === 0) return null;

  const getStatusColor = (bal: number) => 
    bal > 5000 ? "#4CAF50" : bal > 1000 ? "#006A6A" : "#F44336";
  const statusColor = getStatusColor(customer.balance);

  // Only display the first 5 transactions
  const displayedTransactions = transactions.slice(0, 1);
  const hasMoreTransactions = transactions.length > 1;

  return (
    <View style={styles.customerCard}>
      <TouchableOpacity
        style={styles.customerCardHeader}
        onPress={() => navigation.navigate("CustomerDetails", { customer })}
      >
        <View style={styles.customerHeaderLeft}>
          <View style={[styles.statusIndicator, { backgroundColor: statusColor }]} />
          <View>
            <Text style={styles.customerName}>{customer.name}</Text>
            <Text style={styles.customerEmail}>{customer.email}</Text>
          </View>
        </View>
        <View style={styles.customerHeaderRight}>
          <Text style={styles.balanceLabel}>Balance</Text>
          <Text style={styles.balanceAmount}>
            {currency}{formatCurrency(customer.balance)}
          </Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.transactionsToggle}
        onPress={() => setExpanded(x => !x)}
      >
        <Text style={styles.toggleLabel}>
          {expanded ? "Hide Transactions" : "View Transactions"} ({transactions.length})
        </Text>
        <Ionicons 
          name={expanded ? "chevron-up" : "chevron-down"} 
          size={18} 
          color="#555" 
        />
      </TouchableOpacity>
      {expanded && (
        <View style={styles.transactionsContainer}>
          {transactions.length === 0 ? (
            <Text style={styles.noTransactions}>No transactions found.</Text>
          ) : <>
            <View style={styles.transactionHeader}>
              <Text style={[styles.headerText, { flex: 2 }]}>Date</Text>
              <Text style={[styles.headerText, { flex: 2 }]}>Previous</Text>
              <Text style={[styles.headerText, { flex: 2 }]}>Amount</Text>
              <Text style={[styles.headerText, { flex: 2 }]}>New Balance</Text>
            </View>
            {displayedTransactions.map(tx => (
              <View key={tx.transaction_id || Math.random().toString()}
                    style={styles.transactionRow}>
                <Text style={[styles.rowText, { flex: 2 }]}>
                  {tx.created_at ? new Date(tx.created_at).toLocaleDateString() : ""}
                </Text>
                <Text style={[styles.balanceText, { flex: 2 }]}>
                  {tx.old_balance != null ? currency + formatCurrency(tx.old_balance) : "-"}
                </Text>
                <Text style={[styles.transactionText, { flex: 2, color: tx.amount < 0 ? "#F44336" : "#4CAF50" }]}>
                  {tx.amount != null 
                    ? (tx.amount > 0 ? "+" : "") + currency + formatCurrency(Math.abs(tx.amount)) 
                    : "-"}
                </Text>
                <Text style={[styles.totalText, { flex: 2 }]}>
                  {tx.balance_after != null ? currency + formatCurrency(tx.balance_after) : "-"}
                </Text>
              </View>
            ))}
            
            {hasMoreTransactions && (
              <TouchableOpacity
                style={styles.viewMoreButton}
                onPress={() => navigation.navigate("AllTransactionsScreen", { 
                  customer, 
                  transactions, 
                  filter: selectedFilter,
                  customRange
                })}
              >
                <Text style={styles.viewMoreText}>
                  View More  
                </Text>
                <Ionicons name="arrow-forward" size={16} color="#0066cc" />
              </TouchableOpacity>
            )}
          </>}
        </View>
      )}
    </View>
  );
};

export default function HomeScreen() {
  const [userId, setUserId]           = useState<string | null>(null);
  const [customers, setCustomers]     = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("all");
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [customRange, setCustomRange]         = useState<CustomRange>({ startDate: null, endDate: null });
  const [totalSum, setTotalSum]               = useState(0);
  const [isLoading, setIsLoading]             = useState(true);
  const [refreshing, setRefreshing]           = useState(false);
  const [isOnline, setIsOnline]               = useState(true);
  const { currency } = useCurrency();

  const filters: FilterType[] = [
    { label: "All Transactions", value: "all" },
    { label: "Today", value: "today" },
    { label: "This Week", value: "week" },
    { label: "This Month", value: "month" },
    { label: "This Year", value: "year" },
    { label: "Custom Date", value: "custom" },
  ];

  // Monitor connectivity
  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected === true);
    });
    return unsub;
  }, []);

  // Try syncing queued txns when back online
  useEffect(() => {
    if (!isOnline) return;
    (async () => {
      const raw = await AsyncStorage.getItem("@txn_queue");
      const queue: Transaction[] = raw ? JSON.parse(raw) : [];
      if (queue.length === 0) return;
      for (const tx of queue) {
        await supabase.from("transactions").insert(tx);
      }
      await AsyncStorage.removeItem("@txn_queue");
      loadCustomers();
    })();
  }, [isOnline]);

  // fetch session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id || null);
    });
  }, []);

  // Load customers (online or from cache)
  const loadCustomers = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);

    const key = `@cached_customers_${userId}`;
    if (isOnline) {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("user_id", userId);
      if (data) {
        const arr = data.map(c => ({ ...c, checked: false, balance: c.balance ?? 0 }));
        setCustomers(arr);
        await AsyncStorage.setItem(key, JSON.stringify(arr));
      }
    } else {
      const raw = await AsyncStorage.getItem(key);
      setCustomers(raw ? JSON.parse(raw) : []);
    }

    setIsLoading(false);
    setRefreshing(false);
  }, [userId, isOnline]);

  useFocusEffect(useCallback(() => { loadCustomers(); }, [loadCustomers]));

  const sortedCustomers = useMemo(() =>
    [...customers].sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    ), [customers]);

  const filteredCustomers = useMemo(() => {
    if (!searchQuery.trim()) return sortedCustomers;
    return sortedCustomers.filter(c =>
      c.name.toLowerCase().includes(searchQuery) ||
      c.email.toLowerCase().includes(searchQuery)
    );
  }, [sortedCustomers, searchQuery]);

  // Compute summary total
  useEffect(() => {
    (async () => {
      if (customers.length === 0) { setTotalSum(0); return; }
      const ids = customers.map(c => c.id);
      let q = supabase.from("transactions").select("amount").in("customer_id", ids);
      if (selectedFilter !== "all") {
        const { startDate, endDate } = getDateRange(selectedFilter, customRange);
        if (startDate && endDate) {
          q = q.gte("created_at", startDate.toISOString())
               .lt("created_at", endDate.toISOString());
        } else if (selectedFilter === "custom") {
          setTotalSum(0); return;
        }
      }
      const { data, error } = await q;
      if (data) {
        setTotalSum(data.reduce((sum, tx: any) => sum + Number(tx.amount), 0));
      } else {
        setTotalSum(0);
      }
    })();
  }, [customers, selectedFilter, customRange]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadCustomers();
  }, [loadCustomers]);

  const todayDate = new Date().toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric"
  });

  const getFilterLabel = () => {
    const f = filters.find(f => f.value === selectedFilter);
    return f?.label ?? "All Transactions";
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <View style={styles.headerContainer}>
        <Text style={styles.header}>My Customers</Text>
        <Text style={styles.todayText}>{todayDate}</Text>
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Total Transactions</Text>
              <Text style={styles.summaryValue}>{currency}{formatCurrency(totalSum)}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Customers</Text>
              <Text style={styles.summaryValue}>{customers.length}</Text>
            </View>
          </View>
          <View style={styles.filterChip}>
            <Text style={styles.filterChipText}>
              <Ionicons name="funnel-outline" size={14} />
              {" "}Showing: {getFilterLabel()}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.searchFilterContainer}>
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={20} color="#888" style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: "#fff" }]}           // 1. White input text

             placeholder="Search customers..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#999"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={20} color="#888" />
            </TouchableOpacity>
          )}
        </View>
      <Dropdown
  style={styles.dropdown}
  data={filters}
  labelField="label"
  valueField="value"
  value={selectedFilter}
  placeholder="Select Filter"
  placeholderStyle={{ color: "#fff" }}
  selectedTextStyle={{ color: "#fff" }}
  onChange={item => {
    setSelectedFilter(item.value);
    if (item.value === "custom") setShowCustomPicker(true);
  }}
  renderLeftIcon={() => (
    <Ionicons
      name="calendar-outline"
      size={20}
      color="#fff"
      style={{ marginRight: 8 }}
    />
  )}
/>

      </View>

      <DatePickerModal
        mode="range"
        visible={showCustomPicker}
        onDismiss={() => setShowCustomPicker(false)}
        startDate={customRange.startDate ?? new Date()}
        endDate={customRange.endDate ?? new Date()}
        onConfirm={({ startDate, endDate }) => {
          if (startDate && endDate) {
            startDate.setHours(0,0,0,0);
            endDate.setHours(23,59,59,999);
            setCustomRange({ startDate, endDate });
          }
          setShowCustomPicker(false);
        }}
        saveLabel="Apply"
        label="Select a date range"
        locale="en"
      />

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0066cc" />
          <Text style={styles.loadingText}>Loading customers...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#0066cc"]} />
          }
        >
          {filteredCustomers.length === 0 ? (
            <View style={styles.emptyStateContainer}>
              <Ionicons name="people-outline" size={64} color="#ccc" />
              <Text style={styles.noCustomer}>
                {searchQuery ? "No matching customers found." : "No customers found."}
              </Text>
              <Text style={styles.emptyStateSubtext}>
                {searchQuery ? "Try a different search term." : "Start by adding your first customer."}
              </Text>
            </View>
          ) : filteredCustomers.map(c => (
            <CustomerCard
              key={c.id.toString()}
              customer={c}
              selectedFilter={selectedFilter}
              customRange={customRange}
              isOnline={isOnline}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
container: { flex: 1, backgroundColor: "#121212" },
headerContainer: {
 paddingTop: 40,
paddingBottom: 16,
paddingHorizontal: 16,
borderBottomWidth: 1,
borderBottomColor: "#333",
},
header: { fontSize: 28, fontWeight: "bold", color: "#fff" },
todayText: { fontSize: 14, color: "#ccc", marginBottom: 16 },
summaryCard: {
backgroundColor: "#1C1F24",
borderRadius: 12,
padding: 16,
marginTop: 8, 
},
summaryRow: { flexDirection: "row", justifyContent: "space-between" },
summaryItem: { flex: 1 },
summaryLabel: { fontSize: 13, color: "#fff", marginBottom: 4 },
summaryValue: { fontSize: 22, fontWeight: "bold", color: "#ffff" },
filterChip: {
backgroundColor: "#333",
alignSelf: "flex-start",
paddingHorizontal: 12,
paddingVertical: 4,
borderRadius: 16,
marginTop: 12,
},
filterChipText: { fontSize: 12, color: "#fff" },
searchFilterContainer: {
 padding: 16,
borderBottomWidth: 1,
borderBottomColor: "#333",
},
searchContainer: {
flexDirection: "row",
alignItems: "center",
backgroundColor: "#1C1F24",
borderRadius: 8,
paddingHorizontal: 12,
marginBottom: 12,
},
searchIcon: { marginRight: 8, color: "#888" },
searchInput: { flex: 1, height: 44, fontSize: 16, color: "#fff" },
dropdown: {
height: 44,
backgroundColor: "#1C1F24",
borderRadius: 8,
paddingHorizontal: 12,
color: "#fff",
},
scrollView: { flex: 1 },
loadingContainer: {
flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 40,
},
loadingText: { marginTop: 12, color: "#ccc" },
emptyStateContainer: {
flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 60,
},
emptyStateSubtext: { color: "#888", marginTop: 8 },
noCustomer: { fontSize: 18, fontWeight: "500", color: "#ccc", marginTop: 16 },
customerCard: {
backgroundColor: "#1C1F24",
borderRadius: 12,
marginHorizontal: 16,
marginVertical: 8,
shadowColor: "#000",
shadowOffset: { width: 0, height: 1 },
shadowOpacity: 0.2,
shadowRadius: 3,
elevation: 2,
overflow: "hidden",
},
customerCardHeader: {
flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16,
},
customerHeaderLeft: { flexDirection: "row", alignItems: "center" },
statusIndicator: { width: 8, height: 40, borderRadius: 4, marginRight: 12 },
customerName: { fontSize: 18, fontWeight: "600", color: "#fff" },
customerEmail: { fontSize: 14, color: "#aaa", marginTop: 2 },
customerHeaderRight: { alignItems: "flex-end" },
balanceLabel: { fontSize: 12, color: "#aaa" },
balanceAmount: { fontSize: 18, fontWeight: "bold", color: "#fff" },
transactionsToggle: {
flexDirection: "row", justifyContent: "space-between", alignItems: "center",
paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: "#333",
},
toggleLabel: { fontSize: 14, color: "#ccc", fontWeight: "500" },
transactionsContainer: {
borderTopWidth: 1, borderTopColor: "#333", paddingHorizontal: 8, paddingBottom: 12,
},
noTransactions: { textAlign: "center", paddingVertical: 16, color: "#888" },
transactionHeader: {
flexDirection: "row", paddingVertical: 10, paddingHorizontal: 4,
backgroundColor: "#2A2A2A", borderRadius: 6, marginBottom: 4, marginTop: 8,
},
headerText: {
fontSize: 12, fontWeight: "600", color: "#ccc", textAlign: "center",
},
transactionRow: {
flexDirection: "row", paddingVertical: 8, paddingHorizontal: 4,
borderBottomWidth: 1, borderBottomColor: "#333",
},
rowText: { fontSize: 12, color: "#fff", textAlign: "center" },
balanceText: { fontSize: 12, fontWeight: "500", color: "#fff", textAlign: "center" },
transactionText: { fontSize: 12, fontWeight: "500", textAlign: "center" },
totalText: { fontSize: 12, fontWeight: "bold", color: "#fff", textAlign: "center" },
viewMoreButton: {
flexDirection: "row",
justifyContent: "center",
alignItems: "center",
paddingVertical: 10,
marginTop: 8,
backgroundColor: "#333",
borderRadius: 6,
},
viewMoreText: {
color: "#61DAFB",
fontWeight: "500",
marginRight: 6,
},
});