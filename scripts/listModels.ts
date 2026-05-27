import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = "AIzaSyBm_Igx9oFEmG8c4jhDIkuYkTu5_n7kHBs"; // from .env.local

async function listModels() {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(err);
  }
}

listModels();
