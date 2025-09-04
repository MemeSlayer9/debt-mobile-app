import React, { useState } from "react";
import { View, FlatList, TextInput, StyleSheet } from "react-native";
import { Checkbox, Button, Card, Text, Appbar, Divider } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";

const invoices = [
  { id: "1", invoice: "1001", company: "Tech Jungle", dueDate: "14 Sep 2022", status: "Unpaid", amount: "$973.48" },
  { id: "2", invoice: "1002", company: "Tech Jungle", dueDate: "14 Sep 2022", status: "Paid", amount: "$480.21" },
  { id: "3", invoice: "1003", company: "Tech Jungle", dueDate: "14 Sep 2022", status: "Unpaid", amount: "$1254.37" },
];

const InvoiceScreen = () => {
  const [selectedInvoices, setSelectedInvoices] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");

  const toggleSelection = (id) => {
    setSelectedInvoices((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const filteredInvoices = invoices.filter((item) =>
    item.invoice.includes(searchQuery) || item.company.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderItem = ({ item }) => (
    <Card style={styles.card}>
      <View style={styles.cardHeader}>
        <Checkbox
          status={selectedInvoices.includes(item.id) ? "checked" : "unchecked"}
          onPress={() => toggleSelection(item.id)}
        />
        <Text style={styles.invoiceNumber}>{item.invoice}</Text>
        <Text style={[styles.status, item.status === "Unpaid" ? styles.unpaid : styles.paid]}>
          {item.status}
        </Text>
      </View>
      <Divider style={styles.divider} />
      <Text style={styles.cardText}>Company: {item.company}</Text>
      <Text style={styles.cardText}>Due Date: {item.dueDate}</Text>
      <Text style={styles.cardText}>Amount: {item.amount}</Text>
      <View style={styles.actionIcons}>
        <Ionicons name="eye-outline" size={22} style={styles.icon} />
        <Ionicons name="pencil-outline" size={22} style={styles.icon} />
        <Ionicons name="trash-outline" size={22} color="red" />
      </View>
    </Card>
  );

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.Content title="Invoices" />
      </Appbar.Header>
      <View style={styles.searchContainer}>
        <TextInput
          placeholder="Search invoice"
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={styles.searchInput}
        />
      </View>
      <FlatList data={filteredInvoices} keyExtractor={(item) => item.id} renderItem={renderItem} />
      <View style={styles.buttonContainer}>
        <Button mode="contained" onPress={() => alert("Mark as Paid")} icon="check" style={styles.button}>
          Mark as Paid
        </Button>
        <Button mode="outlined" onPress={() => alert("Delete Selected")} icon="trash-can" style={styles.button}>
          Delete
        </Button>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  searchContainer: { padding: 10 },
  searchInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    padding: 10,
    backgroundColor: "white",
  },
  card: {
    marginVertical: 6,
    marginHorizontal: 10,
    padding: 12,
    backgroundColor: "white",
    borderRadius: 8,
    elevation: 3,
  },
  cardHeader: { flexDirection: "row", alignItems: "center" },
  invoiceNumber: { flex: 1, fontWeight: "bold", fontSize: 16 },
  status: { fontWeight: "bold", paddingVertical: 4, paddingHorizontal: 10, borderRadius: 5 },
  unpaid: { backgroundColor: "#FFEBEE", color: "#D32F2F" },
  paid: { backgroundColor: "#E8F5E9", color: "#388E3C" },
  divider: { marginVertical: 6 },
  cardText: { fontSize: 14, color: "#555", marginBottom: 2 },
  actionIcons: { flexDirection: "row", justifyContent: "flex-end", marginTop: 10 },
  icon: { marginHorizontal: 10, color: "#444" },
  buttonContainer: { flexDirection: "row", justifyContent: "space-around", padding: 15 },
  button: { width: "45%" },
});

export default InvoiceScreen;
