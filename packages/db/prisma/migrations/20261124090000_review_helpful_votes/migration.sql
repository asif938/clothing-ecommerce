-- One "helpful" vote per visitor per review.
CREATE TABLE "review_helpful_votes" (
    "id" TEXT NOT NULL,
    "review_id" TEXT NOT NULL,
    "voter_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_helpful_votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "review_helpful_votes_review_id_voter_key_key" ON "review_helpful_votes"("review_id", "voter_key");

-- AddForeignKey
ALTER TABLE "review_helpful_votes" ADD CONSTRAINT "review_helpful_votes_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
