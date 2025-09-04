import React, { useState, useEffect } from "react";
import { DatePickerModal } from "react-native-paper-dates";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  StatusBar,
} from "react-native";
import { Provider as PaperProvider, Avatar, IconButton } from "react-native-paper";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { supabase } from "../supabase/supabaseClient";
import { useUser } from "../context/UserContext";
import { useCurrency } from "../context/CurrencyContext";
import { Ionicons } from "@expo/vector-icons"; // Make sure to install expo vector icons
import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";

type Customer = {
  id: number;
  checked: boolean;
  name: string;
  email: string;
  phone: string;
  balance: number;
  date: string;
  user_id: string;
};

type BeforeRemoveEvent = {
  data: { action: any };
  preventDefault: () => void;
};

interface DeletionQueueItem {
  customerIds: number[];
  timestamp: number;
  userId: string;
}

export default function InvoiceMobileUI() {
  const navigation = useNavigation<any>();
  const { logout } = useUser();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchText, setSearchText] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("All");
  const { currency } = useCurrency();
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [deletionQueue, setDeletionQueue] = useState<DeletionQueueItem[]>([]);

  // Currency formatting function
  const formatCurrency = (amount: number) => {
    return amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  // Get current user session
  useEffect(() => {
    const fetchUser = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setUserId(session?.user?.id || null);
    };
    fetchUser();
  }, []);

// Add explicit type for processedItems in the processDeletionQueue function
const processDeletionQueue = async () => {
  if (!isOnline || deletionQueue.length === 0 || !userId) return;
  
  const currentQueue = [...deletionQueue];
  const processedItems: DeletionQueueItem[] = []; // Now explicitly typed
  
  for (const item of currentQueue) {
    // Only process items for current user
    if (item.userId !== userId) continue;
    
    try {
      // Delete related transactions
      await supabase
        .from("transactions")
        .delete()
        .in("customer_id", item.customerIds);
      
      // Delete related summaries
      await supabase
        .from("customer_transaction_summary")
        .delete()
        .in("customer_id", item.customerIds);
      
      // Delete customers
      await supabase
        .from("customers")
        .delete()
        .in("id", item.customerIds);
      
      // Mark this item as processed
      processedItems.push(item);
    } catch (error) {
      console.error("Error processing deletion queue:", error);
      // Keep the item in the queue for retry later
    }
  }
  
  // Update queue only after processing
  if (processedItems.length > 0) {
    const newQueue = deletionQueue.filter(item => 
      !processedItems.some(processedItem => processedItem.timestamp === item.timestamp)
    );
    
    setDeletionQueue(newQueue);
    
    try {
      await AsyncStorage.setItem('customerDeletionQueue', JSON.stringify(newQueue));
    } catch (error) {
      console.error("Error saving deletion queue:", error);
    }
  }
};

  const getDeletedCustomerIds = () => {
    const deletedIds = new Set<number>();
    deletionQueue.forEach(item => {
      if (item.userId === userId) {
        item.customerIds.forEach(id => deletedIds.add(id));
      }
    });
    return deletedIds;
  };

  const filterOutDeletedCustomers = (customerList: Customer[]) => {
    if (deletionQueue.length === 0) return customerList;
    const deletedIds = getDeletedCustomerIds();
    return customerList.filter(customer => !deletedIds.has(customer.id));
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener(
      "beforeRemove",
      (e: BeforeRemoveEvent) => {
        e.preventDefault();
        Alert.alert("Confirm Logout", "Are you sure you want to log out?", [
          { text: "Cancel", style: "cancel", onPress: () => {} },
          {
            text: "Logout",
            style: "destructive",
            onPress: () => {
              logout();
              navigation.dispatch(e.data.action);
            },
          },
        ]);
      }
    );
    return unsubscribe;
  }, [navigation, logout]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const wasOffline = !isOnline;
      setIsOnline(state.isConnected ?? false);
      
      // If we're back online and we were previously offline, process any pending deletions
      if (state.isConnected && wasOffline) {
        processDeletionQueue();
      }
    });

    return () => unsubscribe();
  }, [isOnline]);

  useEffect(() => {
    const loadDeletionQueue = async () => {
      try {
        const queueJson = await AsyncStorage.getItem('customerDeletionQueue');
        if (queueJson) {
          const queue = JSON.parse(queueJson);
          setDeletionQueue(queue);
        }
      } catch (error) {
        console.error("Error loading deletion queue:", error);
      }
    };
    
    loadDeletionQueue();
  }, []);

  // Load user-specific customers
  const loadCustomers = async () => {
    if (!userId) return;
    
    try {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("user_id", userId);
        
      if (error) {
        console.error("Error fetching customers:", error);
        return;
      }
      
      if (data) {
        const customersWithChecked = data.map((customer: any) => ({
          ...customer,
          checked: false,
          balance: customer.balance || 0,
        }));
        
        // Apply the filter to remove customers that are in the deletion queue
        const filteredCustomers = filterOutDeletedCustomers(customersWithChecked);
        setCustomers(filteredCustomers);
      }
    } catch (e) {
      console.error("Unexpected error in loadCustomers:", e);
    }
  };

  // Process the queue whenever it changes
  useEffect(() => {
    if (isOnline && deletionQueue.length > 0) {
      processDeletionQueue();
    }
  }, [deletionQueue, isOnline]);

  // Refresh data when screen is focused
  useFocusEffect(
    React.useCallback(() => {
      loadCustomers();
    }, [userId, deletionQueue]) // Add deletionQueue as dependency
  );

  // Realtime subscription for user-specific changes
  useEffect(() => {
    if (!userId) return;
    
    const channel = supabase
      .channel("realtime-customers")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "customers",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          // For inserts and updates, ensure we're not showing deleted items
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            loadCustomers();
          } 
          // For deletes, we handle that through our queue system
          else if (payload.eventType === 'DELETE') {
            // Just reload to ensure our UI is in sync
            loadCustomers();
          }
        }
      )
      .subscribe((status: any) => {
        console.log("Realtime channel status:", status);
      });
      
    return () => {
      console.log("Unsubscribing from realtime channel");
      channel.unsubscribe();
    };
  }, [userId]);

  // Toggle checkbox for customer selection
  const toggleCheckbox = (id: number) => {
    setCustomers((prev) =>
      prev.map((customer) =>
        customer.id === id ? { ...customer, checked: !customer.checked } : customer
      )
    );
  };

  // Toggle selection mode
  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    if (isSelectionMode) {
      // Clear all selections when exiting selection mode
      setCustomers((prev) =>
        prev.map((customer) => ({ ...customer, checked: false }))
      );
    }
  };

  // Select all customers
  const selectAll = () => {
    setCustomers((prev) =>
      prev.map((customer) => ({ ...customer, checked: true }))
    );
  };

  // Handle deletion of selected customers from multiple tables
  const handleDeleteSelected = () => {
    const selectedCustomers = customers.filter((customer) => customer.checked);
    if (selectedCustomers.length === 0) {
      Alert.alert("No Selection", "Please select at least one customer to delete.");
      return;
    }
    
    Alert.alert(
      "Delete Customers",
      `Are you sure you want to delete ${selectedCustomers.length} selected customer(s)?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const selectedIds = selectedCustomers.map((customer) => customer.id);
            
            // Add to deletion queue (handles both online and offline)
            await addToDeleteQueue(selectedIds);
            
            // Exit selection mode
            setIsSelectionMode(false);
            
            // Notify user based on connection status
            if (!isOnline) {
              Alert.alert(
                "Offline Mode", 
                "Customer(s) will be deleted from the server when you're back online.",
                [{ text: "OK" }]
              );
            }
          },
        },
      ]
    );
  };

  const addToDeleteQueue = async (customerIds: number[]) => {
    if (!userId) return;
    
    const newQueueItem: DeletionQueueItem = {
      customerIds,
      timestamp: Date.now(),
      userId
    };
    
    const newQueue = [...deletionQueue, newQueueItem];
    
    try {
      // Update the queue in state and storage
      setDeletionQueue(newQueue);
      await AsyncStorage.setItem('customerDeletionQueue', JSON.stringify(newQueue));
      
      // Update local view immediately by removing these customers
      setCustomers(prevCustomers => 
        prevCustomers.filter(customer => !customerIds.includes(customer.id))
      );
      
      // If online, try to process immediately
      if (isOnline) {
        // We'll let the useEffect handle this to avoid state update conflicts
        // The useEffect will fire because we updated deletionQueue state
      }
    } catch (error) {
      console.error("Error adding to deletion queue:", error);
    }
  };

  // Filter customers by search text and status filter
  const filteredCustomers = customers.filter((customer: Customer) => {
    const status = customer.balance > 0 ? "Unpaid" : "Paid";
    return (
      (searchText === "" ||
        customer.name.toLowerCase().includes(searchText.toLowerCase()) ||
        customer.email.toLowerCase().includes(searchText.toLowerCase()) ||
        customer.phone.includes(searchText)) &&
      (filterStatus === "All" || filterStatus === status)
    );
  });

  // Sort so that newest (most recent date) appears first
  const sortedCustomers = [...filteredCustomers].sort(
    (a: Customer, b: Customer) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  // Count the selected customers
  const selectedCount = customers.filter((customer) => customer.checked).length;

  // Calculate total balance of all customers
  const totalBalance = customers.reduce(
    (acc, customer) => acc + customer.balance,
    0
  );

  // Generate initials from customer name
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  return (
    <PaperProvider>
      <StatusBar barStyle="light-content" backgroundColor="#121212" />
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>Invoices</Text>
            <View style={styles.headerRightActions}>
              {isSelectionMode ? (
                <>
                  <TouchableOpacity onPress={selectAll} style={styles.headerAction}>
                    <Ionicons name="checkmark-done" size={24} color="#006A6A" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={toggleSelectionMode} style={styles.headerAction}>
                    <Ionicons name="close" size={24} color="#e74c3c" />
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity onPress={toggleSelectionMode} style={styles.headerAction}>
                    <Ionicons name="checkbox-outline" size={22} color="#ffffff" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => {}} style={styles.headerAction}>
                    <Ionicons name="settings-outline" size={22} color="#ffffff" />
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
          <Text style={styles.headerDate}>
            {new Date().toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
            {!isOnline && <Text style={styles.offlineIndicator}> • Offline</Text>}
          </Text>
        </View>

        {/* Selection Mode Banner */}
        {isSelectionMode && (
          <View style={styles.selectionBanner}>
            <Text style={styles.selectionText}>
              {selectedCount} customer{selectedCount !== 1 ? "s" : ""} selected
            </Text>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handleDeleteSelected}
            >
              <Ionicons name="trash-outline" size={20} color="#ffffff" />
              <Text style={styles.deleteButtonText}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}

        <ScrollView contentContainerStyle={styles.contentContainer}>
          {/* Search and Filter Container */}
          <View style={styles.searchContainer}>
            <View style={styles.searchInputContainer}>
              <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search customers..."
                placeholderTextColor="#8E8E93"
                value={searchText}
                onChangeText={setSearchText}
              />
              {searchText !== "" && (
                <TouchableOpacity onPress={() => setSearchText("")}>
                  <Ionicons name="close-circle" size={20} color="#8E8E93" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Filter Container */}
          <View style={styles.filterContainer}>
            {["All", "Paid", "Unpaid"].map((filter) => (
              <TouchableOpacity
                key={filter}
                style={[
                  styles.filterPill,
                  filterStatus === filter && styles.selectedFilter,
                ]}
                onPress={() => setFilterStatus(filter)}
              >
                <Text
                  style={[
                    styles.filterText,
                    filterStatus === filter && styles.selectedFilterText,
                  ]}
                >
                  {filter}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Total Balance Card */}
          <View style={styles.totalBalanceCard}>
            <View style={styles.balanceHeader}>
              <Text style={styles.balanceLabel}>Total Balance</Text>
              <Ionicons name="trending-up" size={20} color="#006A6A" />
            </View>
            <Text style={styles.totalBalanceText}>
              {currency}{formatCurrency(totalBalance)}
            </Text>
          </View>

          {/* Customer List */}
          <View style={styles.customerList}>
            {sortedCustomers.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="people" size={50} color="#555" />
                <Text style={styles.emptyStateText}>No customers found</Text>
                <Text style={styles.emptyStateSubtext}>
                  Add your first customer to get started
                </Text>
              </View>
            ) : (
              sortedCustomers.map((customer) => (
                <TouchableOpacity
                  key={customer.id}
                  style={styles.card}
                  onPress={() => {
                    if (isSelectionMode) {
                      toggleCheckbox(customer.id);
                    } else {
                      navigation.navigate("CustomerDetails", { customer });
                    }
                  }}
                  onLongPress={() => {
                    if (!isSelectionMode) {
                      setIsSelectionMode(true);
                      toggleCheckbox(customer.id);
                    }
                  }}
                >
                  <View style={styles.cardHeader}>
                    {isSelectionMode ? (
                      <TouchableOpacity 
                        style={styles.checkboxContainer}
                        onPress={() => toggleCheckbox(customer.id)}
                      >
                        <View style={[
                          styles.checkbox,
                          customer.checked && styles.checkboxChecked
                        ]}>
                          {customer.checked && (
                            <Ionicons name="checkmark" size={16} color="#ffffff" />
                          )}
                        </View>
                      </TouchableOpacity>
                    ) : (
                      <Avatar.Text 
                        size={40} 
                        label={getInitials(customer.name)} 
                        style={styles.avatar}
                        labelStyle={styles.avatarText}
                      />
                    )}
                    <View style={styles.customerInfo}>
                      <Text style={styles.customerName}>{customer.name}</Text>
                      <Text style={styles.customerEmail}>{customer.email}</Text>
                    </View>
                    <View
                      style={[
                        styles.status,
                        customer.balance > 0 ? styles.unpaid : styles.paid,
                      ]}
                    >
                      <Text style={styles.statusText}>
                        {customer.balance > 0 ? "Unpaid" : "Paid"}
                      </Text>
                    </View>
                  </View>
                  
                  <View style={styles.cardDetails}>
                    <View style={styles.detailItem}>
                      <Ionicons name="call-outline" size={16} color="#8E8E93" />
                      <Text style={styles.detailText}>{customer.phone}</Text>
                    </View>
                    <View style={styles.detailItem}>
                      <Ionicons name="calendar-outline" size={16} color="#8E8E93" />
                      <Text style={styles.detailText}>
                        {new Date(customer.date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </Text>
                    </View>
                    <View style={styles.detailItem}>
                      <Ionicons 
                        name={customer.balance > 0 ? "wallet-outline" : "checkmark-circle-outline"} 
                        size={16} 
                        color={customer.balance > 0 ? "#e74c3c" : "#006A6A"} 
                      />
                      <View style={styles.balanceContainer}>
                        <Text style={styles.balanceLabel}>Balance:</Text>
                        <Text 
                          style={[
                            styles.balanceValue, 
                            customer.balance > 0 ? styles.unpaidText : styles.paidText
                          ]}
                        >
                          {customer.balance > 0 
                            ? `${currency}${formatCurrency(customer.balance)}` 
                            : " Fully Paid"
                          }
                        </Text>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        </ScrollView>

        {/* Floating Add Button */}
        <TouchableOpacity
          style={styles.floatingButton}
          onPress={() => navigation.navigate("AddCustomer")}
        >
          <Ionicons name="add" size={30} color="#ffffff" />
        </TouchableOpacity>
      </View>
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: "#121212",
  },
  contentContainer: { 
    paddingBottom: 90,
  },
  header: {
    paddingTop: 50,
    paddingBottom: 15,
    paddingHorizontal: 20,
    backgroundColor: "#121212",
  },
  headerContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: { 
    fontSize: 28, 
    fontWeight: "bold", 
    color: "#ffffff" 
  },
  headerDate: { 
    fontSize: 14, 
    color: "#8E8E93",
    marginTop: 5,
  },
  offlineIndicator: {
    color: "#e74c3c",
    fontWeight: "500"
  },
  headerRightActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerAction: {
    marginLeft: 15,
    padding: 5,
  },
  selectionBanner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#1C1F24",
    padding: 12,
    paddingHorizontal: 20,
  },
  selectionText: { 
    color: "#ffffff", 
    fontWeight: "500",
    fontSize: 16,
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#e74c3c",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  deleteButtonText: {
    color: "#ffffff",
    fontWeight: "bold",
    marginLeft: 5,
  },
  searchContainer: { 
    paddingHorizontal: 20, 
    marginTop: 15,
  },
  searchInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1C1F24",
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: "#ffffff",
  },
  filterContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginVertical: 15,
  },
  filterPill: {
    backgroundColor: "#1C1F24",
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 20,
    marginHorizontal: 5,
  },
  filterText: { 
    color: "#8E8E93", 
    fontSize: 14,
    fontWeight: "500",
  },
  selectedFilter: { 
    backgroundColor: "#006A6A",
  },
  selectedFilterText: { 
    color: "#ffffff",
    fontWeight: "600",
  },
  totalBalanceCard: {
    backgroundColor: "#1C1F24",
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 20,
    marginVertical: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  balanceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 5,
  },
  balanceLabel: {
    fontSize: 16,
    color: "#8E8E93",
  },
  totalBalanceText: { 
    fontSize: 26, 
    fontWeight: "bold", 
    color: "#ffffff",
    marginTop: 5,
  },
  customerList: { 
    paddingHorizontal: 20, 
    marginTop: 15,
    marginBottom: 20,
  },
  card: {
    backgroundColor: "#1C1F24",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: { 
    flexDirection: "row", 
    alignItems: "center", 
    marginBottom: 12 
  },
  checkboxContainer: {
    marginRight: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#006A6A",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: "#006A6A",
  },
  avatar: {
    backgroundColor: "#006A6A",
    marginRight: 12,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: "bold",
  },
  customerInfo: {
    flex: 1,
  },
  customerName: { 
    fontWeight: "bold", 
    fontSize: 16, 
    color: "#ffffff",
    marginBottom: 3,
  },
  customerEmail: {
    fontSize: 13,
    color: "#8E8E93",
  },
  status: {
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  paid: { 
    backgroundColor: "#006A6A" 
  },
  unpaid: { 
    backgroundColor: "#e74c3c" 
  },
  statusText: { 
    fontSize: 12, 
    fontWeight: "bold", 
    color: "#ffffff" 
  },
  cardDetails: {
    marginTop: 5,
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
  },
  detailText: {
    fontSize: 14,
    color: "#8E8E93",
    marginLeft: 8,
  },
  paidText: {
    color: "#006A6A",
  },
  unpaidText: {
    color: "#e74c3c",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#ffffff",
    marginTop: 15,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: "#8E8E93",
    marginTop: 5,
    textAlign: "center",
  },
  floatingButton: {
    position: "absolute",
    bottom: 25,
    right: 25,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#006A6A",
    justifyContent: "center",
    alignItems: "center",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  balanceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  balanceValue: {
    fontSize: 14,
    fontWeight: "600",
  },
});