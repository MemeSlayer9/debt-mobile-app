import React, { useState } from "react";
import { View, Text, Image, TouchableOpacity, FlatList, Dimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

const { width, height } = Dimensions.get("window");

const slides = [
  {
    id: "1",
    title: "Start Your Journey Today",
    description: "Thrive in our fitness community, connect, and live healthier.",
    image: { uri: "https://source.unsplash.com/800x600/?fitness" },
  },
  {
    id: "2",
    title: "Track Your Progress",
    description: "Monitor your daily workouts and stay motivated.",
    image: { uri: "https://source.unsplash.com/800x600/?workout" },
  },
  {
    id: "3",
    title: "Join Our Community",
    description: "Connect with like-minded individuals and grow together.",
    image: { uri: "https://source.unsplash.com/800x600/?community" },
  },
];

const OnboardingScreen: React.FC = ({ navigation }: any) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  const handleNext = () => {
    if (currentIndex < slides.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      navigation.replace("Home"); // Navigate to home screen
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      {/* Skip Button */}
      <TouchableOpacity
        onPress={() => navigation.replace("Home")}
        style={{ position: "absolute", top: 50, right: 20, zIndex: 10 }}
      >
        <Text style={{ color: "#FFA500", fontSize: 16 }}>Skip</Text>
      </TouchableOpacity>

      {/* Onboarding Content */}
      <FlatList
        data={slides}
        horizontal
        pagingEnabled
        keyExtractor={(item) => item.id}
        onScroll={(event) => {
          const index = Math.round(event.nativeEvent.contentOffset.x / width);
          setCurrentIndex(index);
        }}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => (
          <View style={{ width, alignItems: "center", justifyContent: "center", paddingTop: 50 }}>
            <Image source={item.image} style={{ width: width * 0.8, height: height * 0.4, resizeMode: "contain" }} />
            <View style={{ padding: 20, alignItems: "center" }}>
              <Text style={{ fontSize: 20, fontWeight: "bold", color: "#006A6A" }}>{item.title}</Text>
              <Text style={{ fontSize: 16, textAlign: "center", marginTop: 10, color: "#555" }}>{item.description}</Text>
            </View>
          </View>
        )}
      />

      {/* Pagination Dots */}
      <View style={{ flexDirection: "row", alignSelf: "center", marginBottom: 20 }}>
        {slides.map((_, index) => (
          <View
            key={index}
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: index === currentIndex ? "#006A6A" : "#ccc",
              marginHorizontal: 5,
            }}
          />
        ))}
      </View>

      {/* Get Started Button */}
      <TouchableOpacity
        onPress={handleNext}
        style={{
          backgroundColor: "#006A6A",
          padding: 15,
          borderRadius: 10,
          width: width * 0.8,
          alignSelf: "center",
          marginBottom: 30,
        }}
      >
        <Text style={{ color: "#fff", textAlign: "center", fontSize: 16 }}>Get Started</Text>
      </TouchableOpacity>
    </View>
  );
};

export default OnboardingScreen;
