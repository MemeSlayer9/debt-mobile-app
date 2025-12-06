import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  Modal,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRoute, useNavigation, useFocusEffect } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { supabase } from "../supabase/supabaseClient";
import { useCurrency } from "../context/CurrencyContext"; // Import our currency hook

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
  type?: 'balance_add' | 'balance_edit' | 'balance_delete' | 'transaction'; // Fixed type definition
  description?: string; // Add description for balance additions
};

type RootStackParamList = {
  CustomerDetailsScreen: { customer: Customer };
  AllTransactionsScreen: { customer: Customer };
  BalanceHistoryScreen: { customer: Customer }; // Add new screen type
};

type CustomerDetailsNavigationProp = StackNavigationProp<
  RootStackParamList,
  "CustomerDetailsScreen"
>;

const VISIBLE_COUNT = 0;

export default function CustomerDetailsScreen() {
  const route = useRoute();
  const navigation = useNavigation<CustomerDetailsNavigationProp>();
  const { customer } = route.params as { customer: Customer };
  const { currency } = useCurrency(); // Get the selected currency from context

  const [currentCustomer, setCurrentCustomer] = useState<Customer>(customer);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  // State for adding balance
  const [addBalanceModalVisible, setAddBalanceModalVisible] = useState(false);
  const [balanceToAdd, setBalanceToAdd] = useState("");
  // New state for editing balance
  const [editBalanceModalVisible, setEditBalanceModalVisible] = useState(false);
  const [newBalance, setNewBalance] = useState("");
  // Add confirmation modal for deletion
  const [deleteConfirmModalVisible, setDeleteConfirmModalVisible] = useState(false);
  const [editNameModalVisible, setEditNameModalVisible] = useState(false);
const [newCustomerName, setNewCustomerName] = useState("");


  const handleEditName = async () => {
  if (!newCustomerName.trim()) {
    Alert.alert("Missing Name", "Please enter a customer name.");
    return;
  }
  
  const { error } = await supabase
    .from("customers")
    .update({ name: newCustomerName.trim() })
    .eq("id", currentCustomer.id);
  
  if (error) {
    console.error("Error updating name:", error);
    Alert.alert("Error", "Could not update name. Please try again.");
    return;
  }

  setCurrentCustomer({ ...currentCustomer, name: newCustomerName.trim() });
  setEditNameModalVisible(false);
  setNewCustomerName("");
  
  Alert.alert("Success", "Customer name has been updated.");
};
  const storeTransactions = async (txns: Transaction[]) => {
    try {
      await AsyncStorage.setItem("transactions", JSON.stringify(txns));
    } catch (error) {
      console.error("Error storing transactions:", error);
    }
  };

  const loadTransactions = async (): Promise<Transaction[]> => {
    try {
      const stored = await AsyncStorage.getItem("transactions");
      if (stored !== null) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error("Error loading transactions:", error);
    }
    return [];
  };

  const formatCurrency = (amount: number) => {
    return amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const fetchTransactions = async () => {
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("customer_id", currentCustomer.id)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Error fetching transactions:", error);
    } else {
      const fetched = data || [];
      setTransactions(fetched);
      await storeTransactions(fetched);
    }
  };

  // Fetch the latest customer data.
  const fetchCustomer = async () => {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("id", customer.id)
      .maybeSingle();
    if (error) {
      console.error("Error fetching customer:", error);
    } else if (data) {
      setCurrentCustomer(data);
    }
  };

  // Create a balance history transaction record
  const createBalanceTransaction = async (
    oldBalance: number | null,
    newBalance: number,
    addedAmount: number,
    type: 'balance_add' | 'balance_edit' | 'balance_delete'
  ) => {
    const transactionData = {
      customer_id: currentCustomer.id,
      amount: addedAmount,
      old_balance: oldBalance,
      balance_after: newBalance,
      type: type,
      description: type === 'balance_add' 
        ? `Balance added: ${currency}${formatCurrency(addedAmount)}`
        : type === 'balance_edit'
        ? `Balance edited from ${currency}${formatCurrency(oldBalance ?? 0)} to ${currency}${formatCurrency(newBalance)}`
        : 'Balance reset to zero',
      created_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from("transactions")
      .insert([transactionData]);
    
    if (error) {
      console.error("Error creating balance transaction:", error);
    } else {
      // Refresh transactions to show the new balance history
      await fetchTransactions();
    }
  };

  useEffect(() => {
    const initializeTransactions = async () => {
      const storedTxns = await loadTransactions();
      if (storedTxns.length > 0) {
        setTransactions(storedTxns);
      }
      await fetchTransactions();
    };
    initializeTransactions();
  }, [currentCustomer.id]);

  // Re-fetch customer data when the screen is focused.
  useFocusEffect(
    useCallback(() => {
      fetchTransactions();
      fetchCustomer();
    }, [currentCustomer.id])
  );

  // Handler for "Show More" button: navigate to AllTransactionsScreen.
  const handleViewAll = () => {
    navigation.navigate("AllTransactionsScreen", { customer: currentCustomer });
  };

  // Handler for "View All Balance History" button: navigate to BalanceHistoryScreen.
  const handleViewBalanceHistory = () => {
    navigation.navigate("BalanceHistoryScreen", { customer: currentCustomer });
  };

  const latestTransaction = transactions.length > 0 ? transactions[0] : null;

  // Handler to add balance with history tracking.
  const handleAddBalance = async () => {
    if (!balanceToAdd) {
      Alert.alert("Missing Amount", "Please enter an amount to add.");
      return;
    }
    const addAmount = parseFloat(balanceToAdd);
    if (isNaN(addAmount) || addAmount <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount to add.");
      return;
    }
    
    const oldBalance = currentCustomer.balance ?? 0;
    const newBalance = oldBalance + addAmount;
    
    // Update customer balance
    const { error } = await supabase
      .from("customers")
      .update({ balance: newBalance })
      .eq("id", currentCustomer.id);
    
    if (error) {
      console.error("Error updating balance:", error);
      Alert.alert("Error", "Could not add balance. Please try again.");
      return;
    }

    // Create balance history transaction - pass the actual current balance, not the variable
    await createBalanceTransaction(currentCustomer.balance, newBalance, addAmount, 'balance_add');
    
    setCurrentCustomer({ ...currentCustomer, balance: newBalance });
    setAddBalanceModalVisible(false);
    setBalanceToAdd("");
    
    Alert.alert("Success", `Added ${currency}${formatCurrency(addAmount)} to balance.`);
  };

  // New handler to edit balance with history tracking
  const handleEditBalance = async () => {
    if (!newBalance) {
      Alert.alert("Missing Amount", "Please enter the new balance amount.");
      return;
    }
    const updatedBalance = parseFloat(newBalance);
    if (isNaN(updatedBalance) || updatedBalance < 0) {
      Alert.alert("Invalid Amount", "Please enter a valid balance amount.");
      return;
    }
    
    const oldBalance = currentCustomer.balance ?? 0;
    const difference = updatedBalance - oldBalance;
    
    const { error } = await supabase
      .from("customers")
      .update({ balance: updatedBalance })
      .eq("id", currentCustomer.id);
    
    if (error) {
      console.error("Error updating balance:", error);
      Alert.alert("Error", "Could not update balance. Please try again.");
      return;
    }

    // Create balance history transaction - pass the actual current balance, not the variable
    await createBalanceTransaction(currentCustomer.balance, updatedBalance, difference, 'balance_edit');
    
    setCurrentCustomer({ ...currentCustomer, balance: updatedBalance });
    setEditBalanceModalVisible(false);
    setNewBalance("");
    
    Alert.alert("Success", "Balance has been updated.");
  };

  // New handler to delete (zero out) balance with history tracking
  const handleDeleteBalance = async () => {
    const oldBalance = currentCustomer.balance ?? 0;
    
    const { error } = await supabase
      .from("customers")
      .update({ balance: 0 })
      .eq("id", currentCustomer.id);
    
    if (error) {
      console.error("Error deleting balance:", error);
      Alert.alert("Error", "Could not delete balance. Please try again.");
      return;
    }

    // Create balance history transaction - pass the actual current balance, not the variable
    await createBalanceTransaction(currentCustomer.balance, 0, -oldBalance, 'balance_delete');
    
    setCurrentCustomer({ ...currentCustomer, balance: 0 });
    setDeleteConfirmModalVisible(false);
    Alert.alert("Success", "Balance has been reset to zero.");
  };

  return (
    <ScrollView style={styles.container}>
      {/* Header Section */}
      <View style={styles.headerContainer}>
  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
    <Text style={styles.userName}>{currentCustomer.name}</Text>
    <TouchableOpacity
      style={styles.editNameButton}
      onPress={() => {
        setNewCustomerName(currentCustomer.name);
        setEditNameModalVisible(true);
      }}
    >
      <Text style={styles.editNameButtonText}>Edit Name</Text>
    </TouchableOpacity>
  </View>
</View> 
<Modal visible={editNameModalVisible} transparent={true} animationType="slide">
  <View style={styles.modalOverlay}>
    <View style={styles.modalContainer}>
      <Text style={styles.modalTitle}>Edit Customer Name</Text>
      <TextInput
        style={styles.input}
        placeholder="Enter new customer name"
        placeholderTextColor="#AAAAAA"
        value={newCustomerName}
        onChangeText={(text) => setNewCustomerName(text)}
      />
      <View style={styles.modalButtons}>
        <TouchableOpacity style={[styles.modalButton, styles.submitButton]} onPress={handleEditName}>
          <Text style={styles.modalButtonText}>Update</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setEditNameModalVisible(false)}>
          <Text style={styles.modalButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  </View>
</Modal>

      {/* Balance Section */}
      <View style={styles.balanceContainer}>
        <Text style={styles.balanceLabel}>Current Balance</Text>
        {Number(currentCustomer.balance ?? 0) === 0 ? (
          <Text style={styles.paidText}>Paid</Text>
        ) : (
          <Text style={styles.balanceValue}>
            {currency}{formatCurrency(Number(currentCustomer.balance ?? 0))}
          </Text>
        )}
        
        {/* Balance Action Buttons */}
        <View style={styles.balanceActionButtons}>
          <TouchableOpacity
            style={styles.addBalanceButton}
            onPress={() => setAddBalanceModalVisible(true)}
          >
            <Text style={styles.addBalanceButtonText}>Add Balance</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.editBalanceButton}
            onPress={() => {
              setNewBalance((currentCustomer.balance ?? 0).toString());
              setEditBalanceModalVisible(true);
            }}
          >
            <Text style={styles.balanceButtonText}>Edit</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.viewHistoryButton}
            onPress={handleViewBalanceHistory}
          >
            <Text style={styles.balanceButtonText}>View All Balance History</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.deleteBalanceButton}
            onPress={() => setDeleteConfirmModalVisible(true)}
          >
            <Text style={styles.balanceButtonText}>Delete</Text>
          </TouchableOpacity>
        </View>
        
        {latestTransaction && (
          <View style={styles.latestTransactionContainer}>
            <Text style={styles.latestTransactionLabel}>
              Latest Transaction:
            </Text>
            <Text style={styles.latestTransactionText}>
              {latestTransaction.type === 'balance_add' ? '+ ' : 
               latestTransaction.type === 'balance_delete' ? '- ' : ''}
              {currency}{formatCurrency(Math.abs(latestTransaction.amount))} on{" "}
              {latestTransaction.created_at
                ? new Date(latestTransaction.created_at).toLocaleDateString()
                : ""}
            </Text>
            {latestTransaction.description && (
              <Text style={styles.latestTransactionDescription}>
                {latestTransaction.description}
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Account Details Section */}
      <View style={styles.transactionsContainer}>
        <Text style={styles.sectionTitle}>Account Details</Text>
        <View style={{ marginTop: 10 }}>
          <View style={styles.transactionItem}>
            <View style={styles.transactionInfo}>
              <Text style={styles.transactionName}>Email</Text>
              <Text style={styles.transactionTime}>{currentCustomer.email}</Text>
            </View>
          </View>
          <View style={styles.transactionItem}>
            <View style={styles.transactionInfo}>
              <Text style={styles.transactionName}>Phone</Text>
              <Text style={styles.transactionTime}>{currentCustomer.phone}</Text>
            </View>
          </View>
          <View style={styles.transactionItem}>
            <View style={styles.transactionInfo}>
              <Text style={styles.transactionName}>Latest Transaction:</Text>
              <Text style={styles.transactionTime}>
                {new Date(currentCustomer.date).toLocaleDateString()}
              </Text>
            </View>
          </View>
          <View style={styles.actionContainer}>
            <TouchableOpacity
              style={[styles.button, styles.receiveButton]}
              onPress={() =>
                navigation.navigate("AllTransactionsScreen", {
                  customer: currentCustomer,
                })
              }
            >
              <Text style={styles.buttonText}>Add Transaction</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

    
      {/* The transactions list view has been removed. Use the "Add Transaction" button to view all transactions */}
      {transactions.length > VISIBLE_COUNT && (
        <TouchableOpacity style={styles.showMoreButton} onPress={handleViewAll}>
          <Text style={styles.showMoreText}>Show More</Text>
        </TouchableOpacity>
      )}

      {/* Modal for Adding Balance */}
      <Modal visible={addBalanceModalVisible} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Add Balance</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter amount to add"
              placeholderTextColor="#AAAAAA"
              value={balanceToAdd}
              onChangeText={(text) => setBalanceToAdd(text)}
              keyboardType="numeric"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, styles.submitButton]} onPress={handleAddBalance}>
                <Text style={styles.modalButtonText}>Add</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setAddBalanceModalVisible(false)}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal for Editing Balance */}
      <Modal visible={editBalanceModalVisible} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Edit Balance</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter new balance amount"
              placeholderTextColor="#AAAAAA"
              value={newBalance}
              onChangeText={(text) => setNewBalance(text)}
              keyboardType="numeric"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, styles.submitButton]} onPress={handleEditBalance}>
                <Text style={styles.modalButtonText}>Update</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setEditBalanceModalVisible(false)}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Confirmation Modal for Deleting Balance */}
      <Modal visible={deleteConfirmModalVisible} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Delete Balance</Text>
            <Text style={styles.modalText}>Are you sure you want to reset this customer's balance to zero?</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, styles.deleteButton]} onPress={handleDeleteBalance}>
                <Text style={styles.modalButtonText}>Yes, Delete</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setDeleteConfirmModalVisible(false)}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#121212", paddingHorizontal: 20 },
  headerContainer: { marginTop: 20 },
  userName: { color: "#FFFFFF", fontSize: 22, fontWeight: "bold" },
  balanceContainer: { marginTop: 20 },
  balanceLabel: { color: "#AAAAAA", fontSize: 14, marginBottom: 4 },
  balanceValue: { color: "#FFFFFF", fontSize: 32, fontWeight: "bold" },
  paidText: { color: "#4CAF50", fontSize: 32, fontWeight: "bold" },
  balanceActionButtons: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    gap: 8,
    flexWrap: "wrap", // Allow buttons to wrap to next line if needed
  },
  addBalanceButton: {
    backgroundColor: "#006A6A",
    padding: 8,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  editBalanceButton: {
    backgroundColor: "#2196F3",
    padding: 8,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  viewHistoryButton: {
    backgroundColor: "#FF9800",
    padding: 8,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  deleteBalanceButton: {
    backgroundColor: "#F44336",
    padding: 8,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  addBalanceButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  balanceButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  actionContainer: { flexDirection: "row", justifyContent: "space-between", marginTop: 30 },
  button: { flex: 1, padding: 16, borderRadius: 12, alignItems: "center" },
  receiveButton: { backgroundColor: "#1C1F24", paddingVertical: 15, paddingHorizontal: 25, borderRadius: 8 },
  disabledButton: { opacity: 0.5 },
  buttonText: { color: "white", fontSize: 18, fontWeight: "600" },
  transactionsContainer: { marginTop: 30, flex: 1 },
  sectionTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "600" },
  showMoreButton: { backgroundColor: "#006A6A", padding: 10, borderRadius: 8, alignItems: "center", marginTop: 10 },
  showMoreText: { color: "#FFFFFF", fontSize: 16, fontWeight: "bold" },
  transactionItem: { flexDirection: "row", alignItems: "center", backgroundColor: "#1C1F24", borderRadius: 10, padding: 15, marginBottom: 10 },
  transactionInfo: { flex: 1 },
  transactionName: { color: "#FFFFFF", fontSize: 16, fontWeight: "500" },
  transactionTime: { color: "#AAAAAA", fontSize: 14, marginTop: 2 },
  latestTransactionContainer: { marginTop: 10, backgroundColor: "#222", padding: 10, borderRadius: 8 },
  latestTransactionLabel: { color: "#AAAAAA", fontSize: 14, marginBottom: 4 },
  latestTransactionText: { color: "#FFFFFF", fontSize: 16, fontWeight: "bold" },
  latestTransactionDescription: { color: "#AAAAAA", fontSize: 12, marginTop: 4, fontStyle: "italic" },
  
  // Updated styles for balance history
  balanceHistoryContainer: { 
    marginTop: 30, 
    backgroundColor: "#1A1A1A", 
    borderRadius: 12, 
    padding: 15 
  },
  balanceHistoryItem: { 
    backgroundColor: "#2C2C2E", 
    borderRadius: 8, 
    padding: 12, 
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#4CAF50"
  },
  balanceHistoryType: { 
    color: "#4CAF50", 
    fontSize: 14, 
    fontWeight: "600",
    marginBottom: 4
  },
  balanceHistoryAmount: { 
    color: "#FFFFFF", 
    fontSize: 18, 
    fontWeight: "bold",
    marginBottom: 2
  },
  balanceHistoryDate: { 
    color: "#AAAAAA", 
    fontSize: 12,
    marginBottom: 4
  },
  balanceHistoryDetails: { 
    color: "#CCCCCC", 
    fontSize: 12,
    fontStyle: "italic"
  },
  viewMoreHistoryButton: { 
    backgroundColor: "#006A6A", 
    padding: 8, 
    borderRadius: 6, 
    alignItems: "center", 
    marginTop: 8 
  },
  viewMoreHistoryText: { 
    color: "#FFFFFF", 
    fontSize: 14, 
    fontWeight: "500" 
  },
  
  input: { backgroundColor: "#1C1F24", color: "#FFFFFF", padding: 10, borderRadius: 8, marginBottom: 10 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  modalContainer: { backgroundColor: "#0E1114", padding: 20, borderRadius: 10, width: "80%" },
  modalTitle: { color: "#FFFFFF", fontSize: 20, marginBottom: 20, textAlign: "center" },
  modalText: { color: "#FFFFFF", fontSize: 16, marginBottom: 20, textAlign: "center" },
  modalButtons: { flexDirection: "row", justifyContent: "space-between", marginTop: 20 },
  modalButton: { flex: 1, padding: 12, borderRadius: 8, alignItems: "center", marginHorizontal: 5 },
  submitButton: { backgroundColor: "#4CAF50" },
  cancelButton: { backgroundColor: "#F44336" },
  deleteButton: { backgroundColor: "#FF5722" },
  modalButtonText: { color: "#FFFFFF", fontSize: 16 },
  editNameButton: {
  backgroundColor: "#2196F3",
  padding: 8,
  paddingHorizontal: 12,
  borderRadius: 6,
},
editNameButtonText: {
  color: "#FFFFFF",
  fontSize: 14,
  fontWeight: "600",
},
});