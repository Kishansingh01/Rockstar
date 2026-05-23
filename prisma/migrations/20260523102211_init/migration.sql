-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "coins" REAL NOT NULL DEFAULT 1000.0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SpinWheel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "entryFee" REAL NOT NULL DEFAULT 100.0,
    "winnerPoolShare" REAL NOT NULL DEFAULT 70.0,
    "adminPoolShare" REAL NOT NULL DEFAULT 20.0,
    "appPoolShare" REAL NOT NULL DEFAULT 10.0,
    "winnerPoolAccumulated" REAL NOT NULL DEFAULT 0.0,
    "adminPoolAccumulated" REAL NOT NULL DEFAULT 0.0,
    "appPoolAccumulated" REAL NOT NULL DEFAULT 0.0,
    "winnerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    CONSTRAINT "SpinWheel_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SpinWheelParticipant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spinWheelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminatedAt" DATETIME,
    "eliminationOrder" INTEGER,
    CONSTRAINT "SpinWheelParticipant_spinWheelId_fkey" FOREIGN KEY ("spinWheelId") REFERENCES "SpinWheel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SpinWheelParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CoinTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "spinWheelId" TEXT,
    "amount" REAL NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CoinTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CoinTransaction_spinWheelId_fkey" FOREIGN KEY ("spinWheelId") REFERENCES "SpinWheel" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GameConfig" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "description" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "SpinWheelParticipant_spinWheelId_userId_key" ON "SpinWheelParticipant"("spinWheelId", "userId");
