import { gql } from 'graphql-tag';

export const typeDefs = gql`
  type User {
    id: ID!
    email: String!
    name: String
    username: String
    avatarUrl: String
    createdAt: String!
  }

  enum BlockType {
    TEXT
    IMAGE
    LINK
  }

  type BlockStyle {
    borderRadius: Float!
    shadowStrength: Float!
    shadowSoftness: Float!
    shadowOffsetX: Float!
    shadowOffsetY: Float!
    # Text styling
    fontFamily: String
    fontSize: Float
    fontWeight: Float
    color: String
    textOpacity: Float
    textAlign: String
  }

  type BlockEffects {
    brightness: Float
    contrast: Float
    saturation: Float
    hueShift: Float
    blur: Float
  }

  type Block {
    id: ID!
    type: BlockType!
    x: Float!
    y: Float!
    width: Float!
    height: Float!
    content: String!
    style: BlockStyle
    effects: BlockEffects
  }

  type BackgroundConfig {
    mode: String!
    solid: BackgroundSolid
    gradient: BackgroundGradient
  }

  type BackgroundSolid {
    color: String!
  }

  type BackgroundGradient {
    type: String!
    colorA: String!
    colorB: String!
    angle: Float!
  }

  type Page {
    id: ID!
    owner: User
    title: String
    slug: String
    isPublished: Boolean!
    blocks: [Block!]!
    background: BackgroundConfig
    """Published blocks (snapshot at publish time) - only set after publishing"""
    publishedBlocks: [Block!]
    """Published background (snapshot at publish time)"""
    publishedBackground: BackgroundConfig
    """Timestamp of last publish"""
    publishedAt: String
    """Server revision at time of last publish"""
    publishedRevision: Int
    forkedFrom: Page
    createdAt: String!
    updatedAt: String!
    """Server revision number, increments on each save"""
    serverRevision: Int!
    """Schema version for forward compatibility"""
    schemaVersion: Int!
  }
  
  """Result of an update operation with conflict detection"""
  type UpdatePageResult {
    """The updated page (null if conflict or not found)"""
    page: Page
    """True if there was a revision conflict"""
    conflict: Boolean!
    """Current server revision (useful for conflict resolution)"""
    currentServerRevision: Int
    """The local revision that was accepted (matches input if successful)"""
    acceptedLocalRevision: Int
  }

  type AuthPayload {
    success: Boolean!
    message: String!
  }

  type Query {
    me: User
    page(id: ID!): Page
    publicPage(id: ID!): Page
    """Get public page by username (user's primary page)"""
    pageByUsername(username: String!): Page
    publicPages(limit: Int): [Page!]!
    """Check if username is available"""
    usernameAvailable(username: String!): Boolean!
    health: String!
  }

  input BlockEffectsInput {
    brightness: Float
    contrast: Float
    saturation: Float
    hueShift: Float
    blur: Float
  }

  input BlockStyleInput {
    borderRadius: Float
    shadowStrength: Float
    shadowSoftness: Float
    shadowOffsetX: Float
    shadowOffsetY: Float
    # Text styling
    fontFamily: String
    fontSize: Float
    fontWeight: Float
    color: String
    textOpacity: Float
    textAlign: String
  }

  input BlockInput {
    id: ID
    type: BlockType!
    x: Float!
    y: Float!
    width: Float!
    height: Float!
    content: String!
    style: BlockStyleInput
    effects: BlockEffectsInput
  }

  input BackgroundSolidInput {
    color: String!
  }

  input BackgroundGradientInput {
    type: String!
    colorA: String!
    colorB: String!
    angle: Float!
  }

  input BackgroundConfigInput {
    mode: String!
    solid: BackgroundSolidInput
    gradient: BackgroundGradientInput
  }

  input CreatePageInput {
    title: String
  }

  input UpdatePageInput {
    title: String
    blocks: [BlockInput!]
    background: BackgroundConfigInput
    """Client's local revision (for logging/debugging)"""
    localRevision: Int
    """Expected server revision (for conflict detection)"""
    baseServerRevision: Int
  }

  input PublishPageInput {
    """The exact blocks to publish (ensures no stale content)"""
    blocks: [BlockInput!]!
    """The background to publish"""
    background: BackgroundConfigInput
    """Expected server revision (for conflict detection)"""
    baseServerRevision: Int!
  }

  """Result of a publish operation with conflict detection"""
  type PublishPageResult {
    """The published page (null if conflict or not found)"""
    page: Page
    """True if there was a revision conflict (server had newer content)"""
    conflict: Boolean!
    """Current server revision"""
    currentServerRevision: Int
    """The revision that was published"""
    publishedRevision: Int
    """Timestamp of this publish"""
    publishedAt: String
    """Public URL for the page"""
    publicUrl: String
  }

  type Mutation {
    """
    Create a new page. Can be done anonymously.
    """
    createPage(input: CreatePageInput): Page!

    """
    Update a page. Owner only.
    Returns UpdatePageResult with conflict detection.
    """
    updatePage(id: ID!, input: UpdatePageInput!): UpdatePageResult!

    """
    Publish a page with the provided content snapshot. Requires authentication.
    The provided blocks/background become the published version.
    Validates baseServerRevision to prevent publishing stale content.
    """
    publishPage(id: ID!, input: PublishPageInput!): PublishPageResult!

    """
    Fork a published page. Requires authentication.
    """
    forkPage(id: ID!): Page

    """
    Log out the current user.
    """
    logout: AuthPayload!

    """
    Submit feedback for a public page.
    """
    sendFeedback(pageId: ID!, message: String!, email: String): AuthPayload!

    """
    Submit feedback about the product/platform.
    """
    sendProductFeedback(message: String!, email: String): AuthPayload!
  }
`;
