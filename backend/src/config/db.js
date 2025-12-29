import mongoose from "mongoose";

export const connectDB = async () => {
    try{
        const conn = await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 8000,
            socketTimeoutMS: 20000,
            family: 4, 
        });
        
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error){
        console.log(error);
        process.exit(1);
    }
}