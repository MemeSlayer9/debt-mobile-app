import React, { useState } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  FlatList,
  Dimensions,
  StyleSheet,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width, height } = Dimensions.get("window");

// Preload your local logo
const takeControl    = require("@/assets/images/logo_bottom_left.png");
const planPayments   = require("@/assets/images/logo_bottom_right.png");
const celebrateProg  = require("@/assets/images/logo_top_right.png");
const budgetChart    = require("@/assets/images/logo_top_left.png");

const slides = [
  {
    id: "1",
    title: "Take Control of Your Debt",
    description:
      "See all your balances in one dashboard and know exactly what you owe.",
    image: takeControl,
  },
  {
    id: "2",
    title: "Plan Your Payments",
    description:
      "Set custom payment schedules and reminders to stay on track.",
    image: planPayments,
  },
  {
    id: "3",
    title: "Celebrate Your Progress",
    description:
      "Watch your balances shrink and hit milestones on your path to debt-free.",
    image: celebrateProg,
  },
  {
    id: "4",
    title: "Optimize Your Budget",
    description:
      "Gain insights into spending habits to accelerate your debt payoff.",
    image: budgetChart,
  },
];
const OnboardingScreen: React.FC<any> = ({ navigation }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Persist that onboarding has been completed
  const completeOnboarding = async () => {
    try {
      await AsyncStorage.setItem("@onboarding_completed", "true");
    } catch (error) {
      console.error("Error saving onboarding status:", error);
    }
  };

  const handleNext = async () => {
    await completeOnboarding();
    navigation.navigate("Currency");
  };
 

  const renderItem = ({ item }: { item: typeof slides[0] }) => (
    <View style={styles.slide}>
      <Image source={item.image} style={styles.mainImage} />

      <View style={styles.textContainer}>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.description}>{item.description}</Text>
      </View>

      {/* Logo overlay in bottom-left */}
     </View>
  );

  return (
    <View style={styles.container}>
      

      <FlatList
        data={slides}
        horizontal
        pagingEnabled
        keyExtractor={(item) => item.id}
        onScroll={(e) =>
          setCurrentIndex(Math.round(e.nativeEvent.contentOffset.x / width))
        }
        showsHorizontalScrollIndicator={false}
        renderItem={renderItem}
      />

      <View style={styles.pagination}>
        {slides.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i === currentIndex && styles.activeDot,
            ]}
          />
        ))}
      </View>

      <TouchableOpacity onPress={handleNext} style={styles.nextButton}>
        <Text style={styles.nextText}>Get Started</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1,
        backgroundColor: "#121212",

  },
  skipButton: {
    position: "absolute",
    top: 50,
    right: 20,
    zIndex: 10,
  },
  skipText: { color: "#FFA500", fontSize: 16 },
  slide: {
    width,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 50,
  },
  mainImage: {
    width: width * 0.8,
    height: height * 0.4,
    resizeMode: "contain",
  },
  textContainer: { padding: 20, alignItems: "center" },
  title: { fontSize: 20, fontWeight: "bold", color: "#006A6A" },
  description: {
    fontSize: 16,
    textAlign: "center",
    marginTop: 10,
    color: "#555",
  },
  logo: {
    position: "absolute",
    bottom: 20,
    left: 20,
    width: 60,
    height: 60,
    resizeMode: "contain",
  },
  pagination: {
    flexDirection: "row",
    alignSelf: "center",
    marginBottom: 20,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#ccc",
    marginHorizontal: 5,
  },
  activeDot: { backgroundColor: "#006A6A" },
  nextButton: {
    backgroundColor: "#006A6A",
    padding: 15,
    borderRadius: 10,
    width: width * 0.8,
    alignSelf: "center",
    marginBottom: 30,
  },
  nextText: { color: "#fff", textAlign: "center", fontSize: 16 },
});

export default OnboardingScreen;
