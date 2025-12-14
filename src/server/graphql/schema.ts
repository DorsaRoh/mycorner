import { gql } from 'graphql-tag';

export const typeDefs = gql`
  type User {
    id: ID!
    email: String!
    displayName: String
    createdAt: String!
  }

  enum BlockType {
    TEXT
    IMAGE
    LINK
  }

  type BlockStyle {
    borderRadius: Float!
    borderWidth: Float!
    borderSoftness: Float!
    borderColor: String!
    shadowStrength: Float!
    shadowSoftness: Float!
    shadowOffsetX: Float!
    shadowOffsetY: Float!
    opacity: Float!
  }

  type GradientOverlay {
    strength: Float!
    angle: Float!
    colors: [String!]!
  }

  type BlockEffects {
    brightness: Float
    contrast: Float
    saturation: Float
    hueShift: Float
    pixelate: Float
    dither: Float
    noise: Float
    grainSize: Float
    blur: Float
    gradientOverlay: GradientOverlay
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

  type BackgroundAudio {
    url: String!
    volume: Float!
    loop: Boolean!
    enabled: Boolean!
  }

  type Page {
    id: ID!
    owner: User
    title: String
    isPublished: Boolean!
    blocks: [Block!]!
    backgroundAudio: BackgroundAudio
    forkedFrom: Page
    createdAt: String!
    updatedAt: String!
  }

  type AuthPayload {
    success: Boolean!
    message: String!
  }

  type Query {
    me: User
    page(id: ID!): Page
    publicPage(id: ID!): Page
    publicPages(limit: Int): [Page!]!
    health: String!
  }

  input GradientOverlayInput {
    strength: Float!
    angle: Float!
    colors: [String!]!
  }

  input BlockEffectsInput {
    brightness: Float
    contrast: Float
    saturation: Float
    hueShift: Float
    pixelate: Float
    dither: Float
    noise: Float
    grainSize: Float
    blur: Float
    gradientOverlay: GradientOverlayInput
  }

  input BlockStyleInput {
    borderRadius: Float!
    borderWidth: Float!
    borderSoftness: Float!
    borderColor: String!
    shadowStrength: Float!
    shadowSoftness: Float!
    shadowOffsetX: Float!
    shadowOffsetY: Float!
    opacity: Float!
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

  input BackgroundAudioInput {
    url: String!
    volume: Float!
    loop: Boolean!
    enabled: Boolean!
  }

  input CreatePageInput {
    title: String
  }

  input UpdatePageInput {
    title: String
    blocks: [BlockInput!]
    backgroundAudio: BackgroundAudioInput
  }

  type Mutation {
    """
    Request a magic link to be sent to the email.
    In development, the link is logged to console.
    """
    requestMagicLink(email: String!): AuthPayload!

    """
    Create a new page. Can be done anonymously.
    """
    createPage(input: CreatePageInput): Page!

    """
    Update a page. Owner only.
    """
    updatePage(id: ID!, input: UpdatePageInput!): Page

    """
    Publish a page. Requires authentication.
    """
    publishPage(id: ID!): Page

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
  }
`;
