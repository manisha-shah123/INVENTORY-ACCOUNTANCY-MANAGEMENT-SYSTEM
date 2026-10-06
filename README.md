# Inventory Management System

A simple web-based Inventory Management System for managing products, customers, suppliers, sales, purchases, payments, and business records.

## Features

* Admin registration and login
* Secure password hashing using bcrypt
* JWT-based authentication
* Product and inventory management
* Customer and supplier management
* Sales and purchase management
* Payment tracking
* Expense management
* Hisab-Kitab
* Balance sheet
* Dashboard with business information
* MongoDB database
* Company-based data separation

## Technologies Used

### Frontend

* React
* Vite
* JavaScript
* Axios
* React Router
* CSS

### Backend

* Node.js
* Express.js
* MongoDB
* Mongoose
* JWT
* bcryptjs

## Project Structure

```text
Inventory Management System
│
├── backend
│   ├── src
│   ├── .env.example
│   ├── package.json
│   └── ...
│
└── frontend
    ├── src
    ├── package.json
    └── ...
```

## How to Run

### 1. Clone the repository

```bash
git clone YOUR_GITHUB_REPOSITORY_URL
cd Inventory-Management-System
```

### 2. Setup Backend

```bash
cd backend
npm install
```

Create a `.env` file inside the `backend` folder and add your MongoDB connection details and JWT secret.

Example:

```env
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_secret_key
```

Start the backend:

```bash
npm run dev
```

The backend will run on:

```text
http://localhost:5000
```

### 3. Setup Frontend

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the URL shown in the terminal, usually:

```text
http://localhost:5173
```

## Database

This system uses **MongoDB**. You can use MongoDB Atlas to create and manage the database.

Make sure your MongoDB connection string is correctly added to the backend `.env` file.

## Important

* Do not upload your `.env` file to GitHub.
* Do not share your MongoDB password or JWT secret.
* Make sure the backend is running before using the frontend.

## Author

**Manisha Shah**

Bachelor (Hons) in Computing
