import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
} from "react-native";

type Invoice = {
  id: number;
  checked: boolean;
  company: string;
  dueDate: string;
  status: "Paid" | "Unpaid" | "Archived";
  amount: string;
};

const InvoiceMobileUI = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([
    { id: 1001, checked: false, company: "Tech Jungle", dueDate: "14 Sep 2022", status: "Unpaid", amount: "$973.48" },
    { id: 1002, checked: true, company: "CodeX", dueDate: "18 Oct 2022", status: "Paid", amount: "$480.21" },
    { id: 1003, checked: true, company: "Tech Jungle", dueDate: "24 Nov 2022", status: "Unpaid", amount: "$1254.37" },
    { id: 1004, checked: false, company: "Innovate", dueDate: "01 Dec 2022", status: "Archived", amount: "$973.48" },
  ]);
  const [selectedFilter, setSelectedFilter] = useState("All");
  const [searchText, setSearchText] = useState("");

  // Toggle Invoice Selection
  const toggleCheckbox = (id: number) => {
    setInvoices(invoices.map(invoice =>
      invoice.id === id ? { ...invoice, checked: !invoice.checked } : invoice
    ));
  };

  // Filtered Invoices
  const filteredInvoices = invoices.filter(invoice => {
    const matchesSearch =
      searchText === "" ||
      invoice.company.toLowerCase().includes(searchText.toLowerCase()) ||
      invoice.id.toString().includes(searchText);

    if (selectedFilter === "All") return matchesSearch;
    if (selectedFilter === "Unpaid") return invoice.status === "Unpaid" && matchesSearch;
    if (selectedFilter === "Paid") return (invoice.status === "Paid" || invoice.status === "Archived") && matchesSearch;
    if (selectedFilter === "Archived") return invoice.status === "Archived" && matchesSearch;
    return false;
  });

  const StatusBadge = ({ status }: { status: string }) => (
    <View style={[styles.status, status === "Paid" && styles.paid, status === "Unpaid" && styles.unpaid]}>
      <Text style={{ color: status === "Paid" ? "#388E3C" : "#D32F2F", fontWeight: "bold" }}>{status}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search invoices..."
          placeholderTextColor="#666"
          value={searchText}
          onChangeText={setSearchText}
        />
      </View>

      {/* Status Filters */}
            <View style={styles.tabsContainer}>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.buttonContainer}
      >
        {["All", "Unpaid", "Paid", "Archived"].map(filter => (
          <TouchableOpacity
            key={filter}
            style={[styles.filterPill, selectedFilter === filter && styles.selectedFilter]}
            onPress={() => setSelectedFilter(filter)}
          >
            <Text style={[styles.filterText, selectedFilter === filter && styles.selectedFilterText]}>
              {filter}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      </View>

      {/* Invoice List */}
      <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
        {filteredInvoices.map((invoice) => (
          <View key={invoice.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <TouchableOpacity style={styles.checkbox} onPress={() => toggleCheckbox(invoice.id)}>
                <Text>{invoice.checked ? "✓" : "○"}</Text>
              </TouchableOpacity>
              <Text style={styles.invoiceNumber}>#{invoice.id}</Text>
              <StatusBadge status={invoice.status} />
            </View>

            <View style={styles.divider} />

            <Text style={styles.cardText}>Company: {invoice.company}</Text>
            <Text style={styles.cardText}>Due Date: {invoice.dueDate}</Text>
            <Text style={styles.cardText}>Amount: <Text style={{ fontWeight: "bold", color: "#2196F3" }}>{invoice.amount}</Text></Text>

            <View style={styles.actionIcons}>
              <TouchableOpacity>
                <Text style={styles.icon}>🗑️</Text>
              </TouchableOpacity>
              <TouchableOpacity>
                <Text style={styles.icon}>🖨️</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Floating Action Button */}
     
    </View>
  );
};

// Styles
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
buttonContainer: { 
  flexDirection: "row", 
   justifyContent: "space-around", // Distributes filters evenly
  padding: 10 
},
  tabsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    },
filterPill: {
  backgroundColor: "#e0e0e0",
  borderRadius: 20,
  paddingVertical: 10,
  paddingHorizontal: 20, // Increased padding for more spacing
  marginRight: 10, // Adds space between buttons
  marginBottom: 10, // Adds spacing when wrapping to the next line
},
  selectedFilter: { backgroundColor: "#2196F3" },
  filterText: { color: "#666" },
  selectedFilterText: { color: "white" },
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
  unpaid: { backgroundColor: "#FFEBEE" },
  paid: { backgroundColor: "#E8F5E9" },
  divider: { height: 1, backgroundColor: "#ddd", marginVertical: 6 },
  cardText: { fontSize: 14, color: "#555", marginBottom: 2 },
  actionIcons: { flexDirection: "row", justifyContent: "flex-end", marginTop: 10 },
  icon: { marginHorizontal: 10, color: "#444", fontSize: 18 },
  checkbox: { marginRight: 10 },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    backgroundColor: "#2196F3",
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
  fabText: { color: "white", fontSize: 24, lineHeight: 28 },
});

export default InvoiceMobileUI;
