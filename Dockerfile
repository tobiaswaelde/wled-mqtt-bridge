### ####################
### BUILDER
### ####################
FROM node:lts-alpine AS build

# Install build tools (needed for some deps)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install dependencies
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# Copy source
COPY . .

# Build TypeScript -> JS
RUN yarn build

# Bundle into single JS file
RUN yarn bundle


### ####################
### RUNNER
### ####################
FROM node:lts-alpine AS runtime

WORKDIR /app

# Copy only bundled output (no node_modules needed)
COPY --from=build /app/dist ./dist

CMD ["node", "dist/index.js"]