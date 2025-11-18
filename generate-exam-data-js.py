#!/usr/bin/env python3
"""
Generate exam-data.js from dump.json and metadata.json

Usage:
    python generate-exam-data-js.py ai102
    python generate-exam-data-js.py ai900
"""

import json
import sys
from pathlib import Path

def generate_exam_data_js(exam_id):
    """Generate exam-data.js from dump.json and metadata.json"""

    base_path = Path(__file__).parent / 'user-content' / 'exams' / exam_id
    dump_file = base_path / 'dump.json'
    metadata_file = base_path / 'metadata.json'
    output_file = base_path / 'exam-data.js'

    # Check if files exist
    if not dump_file.exists():
        print(f"[ERROR] {dump_file} not found")
        return False

    # Load dump.json
    print(f"[INFO] Reading {dump_file}...")
    with open(dump_file, 'r', encoding='utf-8') as f:
        questions = json.load(f)

    print(f"[OK] Loaded {len(questions)} questions")

    # Load or generate metadata
    if metadata_file.exists():
        print(f"[INFO] Reading {metadata_file}...")
        with open(metadata_file, 'r', encoding='utf-8') as f:
            metadata = json.load(f)
    else:
        print(f"[WARN] metadata.json not found, generating default...")
        metadata = generate_default_metadata(exam_id, questions)

    # Update totalQuestions in metadata
    metadata['totalQuestions'] = len(questions)

    # Generate exam-data.js
    print(f"[INFO] Generating {output_file}...")

    js_content = f"""// {metadata.get('fullName', exam_id.upper())} Exam Data - Auto-generated
window.userExams = window.userExams || {{}};
window.userExams['{exam_id}'] = {{
  metadata: {json.dumps(metadata, indent=2)},
  questions: {json.dumps(questions, indent=2)}
}};

// Dispatch event when data is ready
document.dispatchEvent(new CustomEvent('{exam_id}QuestionsReady'));
console.log('\\u2713 {metadata.get("name", exam_id.upper())} exam data loaded ({len(questions)} questions)');
"""

    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(js_content)

    print(f"[SUCCESS] Generated {output_file}")
    print(f"          Questions: {len(questions)}")
    print(f"          Size: {output_file.stat().st_size / 1024:.1f} KB")

    # Also update metadata.json
    print(f"[INFO] Updating {metadata_file}...")
    with open(metadata_file, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2)
    print(f"[SUCCESS] Updated {metadata_file}")

    return True

def generate_default_metadata(exam_id, questions):
    """Generate default metadata from exam_id and questions"""

    # Detect modules
    modules = list(set(q.get('module', 'GENERAL') for q in questions if q.get('module')))

    # Detect images
    has_images = any(
        q.get('question_images') or q.get('explanation_images')
        for q in questions
    )

    # Default metadata based on exam_id
    if 'ai900' in exam_id.lower():
        return {
            "id": exam_id,
            "name": "AI-900",
            "fullName": "Azure AI Fundamentals",
            "duration": 45,
            "questionCount": 45,
            "totalQuestions": len(questions),
            "passScore": 75,
            "badge": "Fundamentals",
            "icon": "fas fa-brain",
            "modules": modules or ["AI_WORKLOADS", "MACHINE_LEARNING", "COMPUTER_VISION", "NLP", "GENERATIVE_AI"],
            "hasImages": has_images
        }
    elif 'ai102' in exam_id.lower():
        return {
            "id": exam_id,
            "name": "AI-102",
            "fullName": "Azure AI Engineer Associate",
            "duration": 150,
            "questionCount": 45,
            "totalQuestions": len(questions),
            "passScore": 70,
            "badge": "Associate",
            "icon": "fas fa-robot",
            "modules": modules or ["COMPUTER_VISION", "NLP", "KNOWLEDGE_MINING", "CONVERSATIONAL_AI", "GENERATIVE_AI"],
            "hasImages": has_images
        }
    else:
        return {
            "id": exam_id,
            "name": exam_id.upper(),
            "fullName": f"Custom Exam: {exam_id}",
            "duration": 60,
            "questionCount": min(45, len(questions)),
            "totalQuestions": len(questions),
            "passScore": 70,
            "badge": "Custom",
            "icon": "fas fa-book",
            "modules": modules or ["GENERAL"],
            "hasImages": has_images
        }

def main():
    if len(sys.argv) < 2:
        print("Usage: python generate-exam-data-js.py <exam_id>")
        print("Example: python generate-exam-data-js.py ai102")
        sys.exit(1)

    exam_id = sys.argv[1]

    print("=" * 60)
    print(f"Generating exam-data.js for: {exam_id}")
    print("=" * 60)

    success = generate_exam_data_js(exam_id)

    if success:
        print("\n" + "=" * 60)
        print("[SUCCESS] exam-data.js generated!")
        print("=" * 60)
        print("\nNext steps:")
        print(f"1. Refresh the editor to load new data")
        print(f"2. Or restart the server: python server.py")
    else:
        print("\n[ERROR] Failed to generate exam-data.js")
        sys.exit(1)

if __name__ == '__main__':
    main()
